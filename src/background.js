import { startClock, pauseClock, resumeClock, videoMs } from './lib/clock.js';
import { meetCodeFromUrl, folderName, transcriptMarkdown, speakerName, header } from './lib/transcript.js';
import { summarize, summaryMarkdown, PROVIDERS } from './lib/summary.js';
import { SETTINGS } from './lib/settings.js';
import { speech } from './lib/health.js';
import { reviewHtml } from './lib/review.js';

// State lives in storage so a restarted service worker picks up where it left off.
//   rec    (storage.session) the recording in progress:
//          { phase: 'idle'|'recording'|'paused'|'stopping', tabId, meetCode, folder, clock }
//   latest (storage.local)   the one finished recording kept for "summarize again":
//          { meetCode, folder, startedAt, durationMs, lines, micOk, videoDownloadId, transcriptDownloadId, reviewDownloadId, summaryDownloadIds,
//            summary: { status: 'none'|'ready'|'running'|'done'|'failed'|'empty', kind?, message?, result? } }
//   catchup (storage.session) a summary of the recording so far, asked for mid-meeting; never written to disk:
//          { status: 'running'|'done'|'failed', at, result?, kind? }
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

// A summary runs inside this worker, so a freshly started worker has none in flight.
// One left 'running' (browser closed or extension updated mid-summary) would block summarize and delete forever.
control(async () => {
  const l = await getLatest();
  if (l?.summary?.status === 'running') await setLatest({ ...l, summary: { status: 'failed', kind: 'retry' } });
  const { catchup } = await chrome.storage.session.get('catchup');
  if (catchup?.status === 'running') await chrome.storage.session.set({ catchup: { ...catchup, status: 'failed', kind: 'retry' } });
});

// Same path as the ticket 01 prototype: the icon click opens the panel and grants activeTab,
// which tabCapture.getMediaStreamId needs when Start is pressed later.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  chrome.storage.local.remove(['apiKey', 'model']); // OpenRouter settings from 0.1.0; the key sat unencrypted
});
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
    catchup: () => control(catchUp),
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
  await chrome.storage.session.remove('catchup');
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
  await setLatest({ ...latest, reviewDownloadId: await writeReview(latest) });
  await setRec(IDLE);
  return { ok: true };
}

/**
 * Writes review.html, replacing the one already in the folder so a new summary does not leave review (1).html behind.
 * Never throws: the video, transcript and summary matter more than this page.
 */
async function writeReview(latest) {
  try {
    if (latest.reviewDownloadId != null) await forgetDownload(latest.reviewDownloadId);
    const [video] = latest.videoDownloadId != null ? await chrome.downloads.search({ id: latest.videoDownloadId }) : [];
    const html = reviewHtml({ ...latest, video: video?.filename.split(/[\\/]/).pop(), summary: latest.summary?.result });
    return await downloadText(`${latest.folder}/review.html`, html, 'text/html');
  } catch {
    return undefined;
  }
}

// ---------- summary ----------

async function summarizeLatest() {
  const [r, latest, s] = await Promise.all([getRec(), getLatest(), settings()]);
  if (LIVE.includes(r.phase) || r.phase === 'stopping' || !latest) return { ok: false, error: 'busy' };
  if (!speech(latest.lines).length) return { ok: false, error: 'empty' };
  await setLatest({ ...latest, summary: { status: 'running' } });
  runSummary(latest, s); // not awaited: a new recording may start meanwhile
  return { ok: true };
}

// ponytail: pings an extension API so Chrome does not stop the worker during a slow CLI run; connectNative port if this proves flaky.
async function keepingAlive(fn) {
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20_000);
  try { return await fn(); } finally { clearInterval(keepAlive); }
}

const summarizeLines = (rec, s) => summarize({ provider: s.provider, model: s.aiModel, effort: s.aiEffort, notes: s.aiNotes, transcript: transcriptMarkdown(rec) });

const runSummary = (latest, s) => keepingAlive(async () => {
  const model = [PROVIDERS[s.provider], s.aiModel, s.aiEffort].filter(Boolean).join(' ');
  try {
    const res = await summarizeLines(latest, s);
    if (!res.ok) return await updateSummary(latest.folder, { status: 'failed', kind: res.kind, message: res.message });
    const summary = { status: 'done', model, result: res.summary };
    const summaryDownloadId = await downloadText(`${latest.folder}/summary.md`, `${header(latest)}\n${summaryMarkdown(res.summary)}`);
    const current = await getLatest();
    const reviewDownloadId = current?.folder === latest.folder ? await writeReview({ ...current, summary }) : undefined;
    await updateSummary(latest.folder, summary, summaryDownloadId, reviewDownloadId);
  } catch (e) {
    await updateSummary(latest.folder, { status: 'failed', kind: 'retry', message: String(e?.message ?? e) });
  }
});

// Every "summarize again" adds a summary (1).md, (2).md…; keep all their ids so delete removes them all.
async function updateSummary(folder, summary, summaryDownloadId, reviewDownloadId) {
  const l = await getLatest();
  if (l?.folder !== folder) return;
  const summaryDownloadIds = [...(l.summaryDownloadIds ?? []), ...(summaryDownloadId ? [summaryDownloadId] : [])];
  await setLatest({ ...l, summary, summaryDownloadIds, ...(reviewDownloadId != null ? { reviewDownloadId } : {}) });
}

/** Summary of what has been said so far, for someone who joined late or stepped away. Shown in the side panel only. */
async function catchUp() {
  const [r, latest, s, { catchup }] = await Promise.all([getRec(), getLatest(), settings(), chrome.storage.session.get('catchup')]);
  if (!LIVE.includes(r.phase) || latest?.folder !== r.folder || catchup?.status === 'running') return { ok: false, error: 'busy' };
  if (!speech(latest.lines).length) return { ok: false, error: 'empty' };
  const at = videoMs(r.clock, Date.now());
  await chrome.storage.session.set({ catchup: { status: 'running', at } });
  keepingAlive(async () => { // not awaited: the recording goes on meanwhile
    const res = await summarizeLines({ ...latest, durationMs: at }, s).catch((e) => ({ ok: false, kind: 'retry', message: String(e) }));
    if ((await getRec()).folder !== r.folder) return; // stopped and started another recording meanwhile
    await chrome.storage.session.set({ catchup: res.ok ? { status: 'done', at, result: res.summary } : { status: 'failed', at, kind: res.kind } });
  });
  return { ok: true };
}

// ---------- delete ----------

// Deletes the latest recording's files from disk and forgets it. The empty folder stays: the downloads API cannot remove folders.
async function deleteLatest() {
  const [r, latest] = await Promise.all([getRec(), getLatest()]);
  if (!latest) return { ok: true };
  if ([...LIVE, 'stopping'].includes(r.phase) || latest.summary?.status === 'running') return { ok: false, error: 'busy' };
  // summaryDownloadId: single id stored by 0.1.0 before summaryDownloadIds
  for (const id of [latest.videoDownloadId, latest.transcriptDownloadId, latest.reviewDownloadId, latest.summaryDownloadId, ...(latest.summaryDownloadIds ?? [])]) {
    if (id != null) await forgetDownload(id);
  }
  await chrome.storage.local.remove('latest');
  return { ok: true };
}

// ---------- downloads & offscreen ----------

// Base64, not percent-encoding: Thai text grows 9x percent-encoded and a long meeting could pass Chrome's 2 MB URL limit.
function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const downloadText = (filename, text, type = 'text/markdown') =>
  chrome.downloads.download({ url: `data:${type};charset=utf-8;base64,${base64(text)}`, filename, conflictAction: 'uniquify' });

async function forgetDownload(id) {
  await chrome.downloads.removeFile(id).catch(() => {}); // already moved or deleted by the user
  await chrome.downloads.erase({ id });
}

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
