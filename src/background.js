import { startClock, pauseClock, resumeClock, videoMs } from './lib/clock.js';
import { meetCodeFromUrl, folderName, transcriptMarkdown, speakerName, header } from './lib/transcript.js';
import { summarize, summaryMarkdown, DEFAULT_MODEL } from './lib/summary.js';
import { SETTINGS } from './lib/settings.js';
import { speech } from './lib/health.js';

// State lives in storage so a restarted service worker picks up where it left off.
//   rec    (storage.session) the recording in progress:
//          { phase: 'idle'|'recording'|'paused'|'stopping', tabId, meetCode, folder, clock }
//   latest (storage.local)   the one finished recording kept for "summarize again":
//          { meetCode, folder, startedAt, durationMs, lines, micOk, videoDownloadId, transcriptDownloadId, summaryDownloadId,
//            summary: { status: 'none'|'ready'|'running'|'done'|'failed'|'empty', kind?, message? } }
// Summaries only run when the user asks: many recordings never need one.

const IDLE = { phase: 'idle' };
const LIVE = ['recording', 'paused'];

const getRec = async () => (await chrome.storage.session.get('rec')).rec ?? IDLE;
const setRec = async (rec) => {
  await chrome.storage.session.set({ rec });
  showBadge(rec.phase);
};

// REC on the toolbar icon, so you can tell it is recording with the side panel closed.
function showBadge(phase) {
  chrome.action.setBadgeText({ text: phase === 'recording' ? 'REC' : phase === 'paused' ? 'II' : '' });
  chrome.action.setBadgeBackgroundColor({ color: phase === 'paused' ? '#6b7385' : '#e5484d' });
  chrome.action.setBadgeTextColor({ color: '#ffffff' });
}
const getLatest = async () => (await chrome.storage.local.get('latest')).latest;
const setLatest = (latest) => chrome.storage.local.set({ latest });
const settings = async () => ({ ...SETTINGS, ...(await chrome.storage.local.get(Object.keys(SETTINGS))) });

// Control actions run one at a time. Caption lines get their own queue so stop() can wait for them.
const queue = () => { let q = Promise.resolve(); return (fn) => (q = q.then(fn, fn)); };
const control = queue();
const lines = queue();

// Same path as the ticket 01 prototype: the icon click opens the panel and grants activeTab,
// which tabCapture.getMediaStreamId needs when Start is pressed later.
chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }));
chrome.action.onClicked.addListener((tab) => chrome.sidePanel.open({ tabId: tab.id }));

// Keyboard shortcuts also count as invoking the extension, so starting from one can capture the tab.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'toggle-recording') {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {}); // open first, while the key press still counts as a gesture
    const r = await getRec();
    if (LIVE.includes(r.phase)) return control(stop);
    const res = await control(() => start(tab.id));
    await chrome.storage.session.set({ startError: res?.ok ? null : res?.error ?? 'capture' }); // shown by the side panel
  }
  if (command === 'mark-moment') return lines(mark);
});

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.target !== 'sw') return;
  const tabId = sender.tab?.id;
  const handler = {
    start: () => control(() => start(m.tabId)),
    pause: () => control(pause),
    resume: () => control(resume),
    stop: () => control(stop),
    summarize: () => control(summarizeLatest),
    'delete-latest': () => control(deleteLatest),
    mark: () => lines(mark),
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

/** A ⭐ line in the transcript at the current video time; the summary prompt gives these extra weight. */
async function mark() {
  const r = await getRec();
  if (r.phase !== 'recording') return { ok: false };
  const latest = await getLatest();
  if (latest?.folder !== r.folder) return { ok: false };
  const t = videoMs(r.clock, Date.now());
  latest.lines.push({ t, mark: true, speaker: '', text: chrome.i18n.getMessage('markLine') });
  await setLatest(latest);
  return { ok: true, t };
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

  const latest = { ...(await getLatest()), durationMs: videoMs(r.clock, end) };
  latest.summary = { status: speech(latest.lines).length ? 'ready' : 'empty' };
  latest.videoDownloadId = video?.ok
    ? await chrome.downloads.download({ url: video.url, filename: `${r.folder}/recording.webm`, conflictAction: 'uniquify' })
    : null;
  latest.transcriptDownloadId = await downloadText(`${r.folder}/transcript.md`, transcriptMarkdown(latest));
  await setLatest(latest);

  if (latest.videoDownloadId) await downloadFinished(latest.videoDownloadId);
  await closeOffscreen();
  await setRec(IDLE);
  return { ok: true };
}

// ---------- summary ----------

async function summarizeLatest() {
  const [r, latest, s] = await Promise.all([getRec(), getLatest(), settings()]);
  if (LIVE.includes(r.phase) || r.phase === 'stopping' || !latest) return { ok: false, error: 'busy' };
  if (!speech(latest.lines).length) return { ok: false, error: 'empty' };
  if (!s.apiKey) return { ok: false, error: 'no-key' };
  await setLatest({ ...latest, summary: { status: 'running' } });
  runSummary(latest, s); // not awaited: a new recording may start meanwhile
  return { ok: true };
}

async function runSummary(latest, s) {
  // ponytail: pings an extension API so Chrome does not stop the worker during a slow request; offscreen fetch if this proves flaky.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20_000);
  const model = s.model || DEFAULT_MODEL;
  try {
    const res = await summarize({ key: s.apiKey, model, transcript: transcriptMarkdown(latest) });
    const summaryDownloadId = res.ok ? await downloadText(`${latest.folder}/summary.md`, `${header(latest)}\n${summaryMarkdown(res.summary)}`) : undefined;
    await updateSummary(latest.folder, res.ok ? { status: 'done', model } : { status: 'failed', kind: res.kind, message: res.message }, summaryDownloadId);
  } catch (e) {
    await updateSummary(latest.folder, { status: 'failed', kind: 'retry', message: String(e?.message ?? e) });
  } finally {
    clearInterval(keepAlive);
  }
}

async function updateSummary(folder, summary, summaryDownloadId) {
  const l = await getLatest();
  if (l?.folder !== folder) return;
  await setLatest({ ...l, summary, ...(summaryDownloadId ? { summaryDownloadId } : {}) });
}

// ---------- delete ----------

// Deletes the latest recording's files from disk and forgets it. The empty folder stays: the downloads API cannot remove folders.
async function deleteLatest() {
  const [r, latest] = await Promise.all([getRec(), getLatest()]);
  if (!latest) return { ok: true };
  if ([...LIVE, 'stopping'].includes(r.phase) || latest.summary?.status === 'running') return { ok: false, error: 'busy' };
  for (const id of [latest.videoDownloadId, latest.transcriptDownloadId, latest.summaryDownloadId]) {
    if (id == null) continue;
    await chrome.downloads.removeFile(id).catch(() => {}); // already moved or deleted by the user
    await chrome.downloads.erase({ id });
  }
  await chrome.storage.local.remove('latest');
  return { ok: true };
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
