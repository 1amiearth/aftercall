import { startClock, pauseClock, resumeClock, videoMs } from './lib/clock.js';
import { meetCodeFromUrl, folderName, transcriptMarkdown, speakerName, header } from './lib/transcript.js';
import { summarize, summaryMarkdown, DEFAULT_MODEL } from './lib/summary.js';
import { SETTINGS } from './lib/settings.js';

// State lives in storage so a restarted service worker picks up where it left off.
//   rec    (storage.session) the recording in progress:
//          { phase: 'idle'|'recording'|'paused'|'stopping', tabId, meetCode, folder, clock }
//   latest (storage.local)   the one finished recording kept for "summarize again":
//          { meetCode, folder, startedAt, durationMs, lines, micOk, videoDownloadId,
//            summary: { status: 'none'|'running'|'done'|'failed'|'skipped'|'empty', kind?, message? } }

const IDLE = { phase: 'idle' };
const LIVE = ['recording', 'paused'];

const getRec = async () => (await chrome.storage.session.get('rec')).rec ?? IDLE;
const setRec = (rec) => chrome.storage.session.set({ rec });
const getLatest = async () => (await chrome.storage.local.get('latest')).latest;
const setLatest = (latest) => chrome.storage.local.set({ latest });
const settings = async () => ({ ...SETTINGS, ...(await chrome.storage.local.get(Object.keys(SETTINGS))) });

// Control actions run one at a time. Caption lines get their own queue so stop() can wait for them.
const queue = () => { let q = Promise.resolve(); return (fn) => (q = q.then(fn, fn)); };
const control = queue();
const lines = queue();

chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }));

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.target !== 'sw') return;
  const tabId = sender.tab?.id;
  const handler = {
    start: () => control(() => start(m.tabId)),
    pause: () => control(pause),
    resume: () => control(resume),
    stop: () => control(stop),
    'summarize-again': () => control(summarizeAgain),
    utterance: () => lines(() => addLine(tabId, m)),
    'left-meeting': () => autoStop(tabId),
    'track-ended': async () => autoStop((await getRec()).tabId),
    hello: async () => {
      const r = await getRec();
      return { recording: r.tabId === tabId && LIVE.includes(r.phase), paused: r.phase === 'paused' };
    },
  }[m.type];
  if (!handler) return;
  Promise.resolve(handler()).then(reply, (e) => reply({ ok: false, error: String(e?.message ?? e) }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => autoStop(tabId));
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (!info.url) return;
  const r = await getRec();
  if (r.tabId === tabId && meetCodeFromUrl(info.url) !== r.meetCode) autoStop(tabId);
});

async function autoStop(tabId) {
  const r = await getRec();
  if (tabId != null && r.tabId === tabId && LIVE.includes(r.phase)) return control(stop);
}

const toTab = (tabId, msg) => chrome.tabs.sendMessage(tabId, msg).catch(() => {});
const toOffscreen = (msg) => chrome.runtime.sendMessage({ target: 'offscreen', ...msg }).catch(() => undefined);

// ---------- start / pause / resume ----------

async function start(tabId) {
  const r = await getRec();
  if ([...LIVE, 'stopping'].includes(r.phase) && (await hasOffscreen())) return { ok: false, error: 'busy' };
  const tab = await chrome.tabs.get(tabId);
  const meetCode = meetCodeFromUrl(tab.url);
  if (!meetCode) return { ok: false, error: 'not-meet' };

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const s = await settings();
  await openOffscreen();
  const res = await toOffscreen({ type: 'start', streamId, mic: s.mic });
  if (!res?.ok) {
    await closeOffscreen();
    return { ok: false, error: res?.error ?? 'capture' };
  }

  const now = Date.now();
  const folder = folderName(new Date(now), meetCode);
  await setLatest({ meetCode, folder, startedAt: now, durationMs: 0, lines: [], micOk: res.micOk, summary: { status: 'none' } });
  await setRec({ phase: 'recording', tabId, meetCode, folder, clock: startClock(now) });
  toTab(tabId, { type: 'rec:start', chat: s.chat });
  return { ok: true };
}

async function pause() {
  const r = await getRec();
  if (r.phase !== 'recording') return { ok: false };
  await toOffscreen({ type: 'pause' });
  await setRec({ ...r, phase: 'paused', clock: pauseClock(r.clock, Date.now()) });
  toTab(r.tabId, { type: 'rec:pause' });
  return { ok: true };
}

async function resume() {
  const r = await getRec();
  if (r.phase !== 'paused') return { ok: false };
  await toOffscreen({ type: 'resume' });
  await setRec({ ...r, phase: 'recording', clock: resumeClock(r.clock, Date.now()) });
  toTab(r.tabId, { type: 'rec:resume' });
  return { ok: true };
}

// ---------- captions ----------

async function addLine(tabId, m) {
  const r = await getRec();
  if (r.tabId !== tabId || ![...LIVE, 'stopping'].includes(r.phase)) return;
  const [latest, s] = await Promise.all([getLatest(), settings()]);
  if (latest?.folder !== r.folder) return;
  latest.lines.push({ t: videoMs(r.clock, m.wall), speaker: speakerName(m.speaker, s.selfName), text: m.text });
  await setLatest(latest);
}

// ---------- stop ----------

async function stop() {
  const r = await getRec();
  if (!LIVE.includes(r.phase)) return { ok: false };
  const end = Date.now();
  await setRec({ ...r, phase: 'stopping' });

  await toTab(r.tabId, { type: 'rec:stop' }); // the page flushes its last caption lines before replying
  await lines(() => {});
  const video = await toOffscreen({ type: 'stop' });

  const s = await settings();
  const latest = { ...(await getLatest()), durationMs: videoMs(r.clock, end) };
  latest.summary = { status: !latest.lines.length ? 'empty' : !s.apiKey ? 'skipped' : 'running' };
  latest.videoDownloadId = video?.ok
    ? await chrome.downloads.download({ url: video.url, filename: `${r.folder}/recording.webm`, conflictAction: 'uniquify' })
    : null;
  await downloadText(`${r.folder}/transcript.md`, transcriptMarkdown(latest));
  await setLatest(latest);

  if (latest.summary.status === 'empty') await downloadText(`${r.folder}/summary.md`, `${header(latest)}\n${NO_TRANSCRIPT}`);
  if (latest.summary.status === 'running') runSummary(latest, s); // not awaited: a new recording may start meanwhile

  if (latest.videoDownloadId) await downloadFinished(latest.videoDownloadId);
  await closeOffscreen();
  await setRec(IDLE);
  return { ok: true };
}

const NO_TRANSCRIPT = `ไม่มีข้อความให้สรุป เพราะไม่ได้เปิด Live captions (CC) ใน Meet ระหว่างบันทึก

No transcript to summarize: Live captions (CC) were off in Meet during the recording.
`;

// ---------- summary ----------

async function summarizeAgain() {
  const [r, latest, s] = await Promise.all([getRec(), getLatest(), settings()]);
  if (LIVE.includes(r.phase) || r.phase === 'stopping' || !latest) return { ok: false, error: 'busy' };
  if (!latest.lines.length) return { ok: false, error: 'empty' };
  if (!s.apiKey) return { ok: false, error: 'no-key' };
  await setLatest({ ...latest, summary: { status: 'running' } });
  runSummary(latest, s);
  return { ok: true };
}

async function runSummary(latest, s) {
  // ponytail: pings an extension API so Chrome does not stop the worker during a slow request; offscreen fetch if this proves flaky.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20_000);
  const model = s.model || DEFAULT_MODEL;
  try {
    const res = await summarize({ key: s.apiKey, model, transcript: transcriptMarkdown(latest) });
    if (res.ok) await downloadText(`${latest.folder}/summary.md`, `${header(latest)}\n${summaryMarkdown(res.summary)}`);
    await updateSummary(latest.folder, res.ok ? { status: 'done', model } : { status: 'failed', kind: res.kind, message: res.message });
  } catch (e) {
    await updateSummary(latest.folder, { status: 'failed', kind: 'retry', message: String(e?.message ?? e) });
  } finally {
    clearInterval(keepAlive);
  }
}

async function updateSummary(folder, summary) {
  const l = await getLatest();
  if (l?.folder === folder) await setLatest({ ...l, summary });
}

// ---------- downloads & offscreen ----------

const downloadText = (filename, text) =>
  chrome.downloads.download({ url: `data:text/markdown;charset=utf-8,${encodeURIComponent(text)}`, filename, conflictAction: 'uniquify' });

function downloadFinished(id) {
  return new Promise((resolve) => {
    const done = () => { chrome.downloads.onChanged.removeListener(onChange); resolve(); };
    const onChange = (d) => d.id === id && d.state && d.state.current !== 'in_progress' && done();
    chrome.downloads.onChanged.addListener(onChange);
    chrome.downloads.search({ id }).then(([d]) => d && d.state !== 'in_progress' && done());
  });
}

const hasOffscreen = async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length > 0;

async function openOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({ url: 'src/offscreen/offscreen.html', reasons: ['USER_MEDIA'], justification: 'Record the Google Meet tab' });
}

async function closeOffscreen() {
  if (await hasOffscreen()) await chrome.offscreen.closeDocument();
}
