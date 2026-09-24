import { SETTINGS } from '../lib/settings.js';
import { meetCodeFromUrl } from '../lib/transcript.js';
import { videoMs, fmt } from '../lib/clock.js';
import { listModels, DEFAULT_MODEL } from '../lib/summary.js';

// Layout: pre-flight checklist (ticket 05, variant B). See docs/DESIGN.md "หน้าตา Side Panel".

const t = (key, ...subs) => chrome.i18n.getMessage(key, subs) || key;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const app = document.getElementById('app');

const s = {
  view: 'main',
  tabId: null, meetCode: null,
  page: null, // content script status { cc, inCall }, null when it does not answer
  settings: { ...SETTINGS },
  rec: { phase: 'idle' },
  latest: null,
  mic: 'prompt',
  error: null,
  askChatOff: false, // turning the chat notice off needs a second click on a warning
};

// ---------- data ----------

async function loadTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  s.tabId = tab?.id ?? null;
  s.meetCode = meetCodeFromUrl(tab?.url);
  await pollPage();
}

async function pollPage() {
  const before = JSON.stringify(s.page);
  s.page = s.meetCode ? await chrome.tabs.sendMessage(s.tabId, { type: 'status' }).catch(() => null) : null;
  return JSON.stringify(s.page) !== before;
}

async function loadStorage() {
  s.settings = { ...SETTINGS, ...(await chrome.storage.local.get(Object.keys(SETTINGS))) };
  s.latest = (await chrome.storage.local.get('latest')).latest ?? null;
  s.rec = (await chrome.storage.session.get('rec')).rec ?? { phase: 'idle' };
}

const saveSetting = (key, value) => chrome.storage.local.set({ [key]: value });
const sw = (type, extra = {}) => chrome.runtime.sendMessage({ target: 'sw', type, ...extra });

// ---------- pieces ----------

const b = (cls, text, action, arg = '', disabled = false) =>
  `<button class="btn ${cls}" data-a="${action}" data-arg="${esc(arg)}" ${disabled ? 'disabled' : ''}>${esc(text)}</button>`;
const banner = (kind, text, button = '') => `<div class="banner ${kind}" role="status"><span>${esc(text)}</span>${button}</div>`;
const item = (state, title, detail, fix = '') =>
  `<div class="check-item"><span class="mark" aria-hidden="true">${{ ok: '✅', warn: '⚠️', err: '⛔' }[state]}</span>
   <div class="grow">${esc(title)}<div class="muted">${esc(detail)}</div></div>${fix}</div>`;

const live = () => ['recording', 'paused'].includes(s.rec.phase);
const recordingHere = () => s.rec.tabId === s.tabId;

function checklist() {
  const { settings: st, page } = s;
  const meet = !s.meetCode ? item('err', t('meetTab'), t('meetTabNone'))
    : !page ? item('warn', t('meetTab'), t('meetReload'))
    : item('ok', t('meetTab'), s.meetCode);
  const cc = item(page?.cc ? 'ok' : 'warn', t('cc'), page?.cc ? t('ccOn') : t('ccOff'));
  const key = st.apiKey ? item('ok', t('apiKey'), st.model || DEFAULT_MODEL)
    : item('warn', t('apiKey'), t('apiKeyMissing'), b('small', t('addKey'), 'settings'));
  const name = st.selfName ? item('ok', t('selfName'), st.selfName)
    : item('warn', t('selfName'), t('selfNameMissing'), b('small', t('setName'), 'settings'));
  const mic = !st.mic ? item('ok', t('mic'), t('micOff'), b('small', t('turnOn'), 'toggle', 'mic'))
    : s.mic === 'granted' ? item('ok', t('mic'), t('micOn'), b('small', t('turnOff'), 'toggle', 'mic'))
    : item('warn', t('mic'), t('micAsk'), b('small', t('allow'), 'allowMic'));
  const chat = st.chat ? item('ok', t('chat'), t('chatOn'), b('small', t('turnOff'), 'toggle', 'chat'))
    : item('warn', t('chat'), t('chatOff'), b('small', t('turnOn'), 'toggle', 'chat'));
  return `<div><div class="check-title">${t('checklist')}</div>${meet}${cc}${key}${name}${mic}${chat}</div>`;
}

function recordingView() {
  const paused = s.rec.phase === 'paused';
  const lines = s.latest?.lines?.slice(-3) ?? [];
  const warns = [
    s.page && !s.page.cc ? banner('warn', t('ccOffWarn')) : '',
    s.settings.mic && s.latest && s.latest.micOk === false ? banner('warn', t('micFailedWarn')) : '',
  ].join('');
  return `<div class="recbar"><span class="dot ${paused ? 'still' : ''}"></span>
      <span class="timer" id="timer">${fmt(videoMs(s.rec.clock, Date.now()))}</span>
      <span>${t(paused ? 'paused' : 'recording')}</span><span class="spacer"></span>
      ${paused ? b('small', t('resume'), 'resume') : b('small', t('pause'), 'pause')}${b('small rec', t('stop'), 'stop')}</div>
    ${warns}
    <div class="check-title">${t('lastCaptions')}</div>
    <div class="tail">${lines.length
      ? lines.map((l) => `<div><span class="muted">${fmt(l.t)}</span> <b>${esc(l.speaker)}:</b> ${esc(l.text)}</div>`).join('')
      : `<span class="muted">${t('noCaptions')}</span>`}</div>`;
}

function latestView() {
  const l = s.latest;
  if (!l || l.summary?.status === 'none') return '';
  const sum = l.summary;
  const again = l.lines.length ? b('small', t('summarizeAgain'), 'again') : '';
  const status = {
    running: banner('info', t('summaryRunning')),
    done: banner('ok', t('summaryDone')),
    skipped: banner('warn', t('summarySkipped'), again),
    empty: banner('warn', t('summaryEmpty')),
    failed: banner('err', t(`fail_${String(sum.kind).replace('-', '')}`), again),
  }[sum.status] ?? '';
  return `${status}<div class="card"><div class="muted">${t('latest')} · ${esc(l.meetCode)} · ${fmt(l.durationMs)}</div>
    <div class="row">${l.videoDownloadId ? b('small', t('showFiles'), 'showFiles') : ''}${sum.status === 'done' ? again : ''}</div></div>`;
}

function mainView() {
  const busyElsewhere = live() && !recordingHere();
  const body = s.rec.phase === 'stopping' ? banner('info', t('stopping'))
    : live() && recordingHere() ? recordingView()
    : `${checklist()}${b('rec', `● ${t('start')}`, 'start', '', !s.meetCode || busyElsewhere)}`;
  return `<header>AfterCall<button class="icon-btn" data-a="settings" aria-label="${t('settings')}">⚙</button></header>
    <main>${s.error ? banner('err', s.error) : ''}${body}${live() ? '' : latestView()}</main>`;
}

function settingsView() {
  const st = s.settings;
  return `<header>${t('settings')}<button class="icon-btn" data-a="back">${t('back')}</button></header>
  <main>
    <label class="field">${t('keyLabel')}
      <input type="password" data-setting="apiKey" value="${esc(st.apiKey)}" placeholder="sk-or-v1-…" autocomplete="off">
      <span class="muted">${t('keyNote')}</span></label>
    <label class="field">${t('modelLabel')}
      <input list="models" data-setting="model" value="${esc(st.model)}" placeholder="${DEFAULT_MODEL}">
      <datalist id="models"></datalist></label>
    <label class="field">${t('nameLabel')}
      <input data-setting="selfName" value="${esc(st.selfName)}">
      <span class="muted">${t('nameHint')}</span></label>
    <label class="toggle"><input type="checkbox" data-setting="mic" ${st.mic ? 'checked' : ''}> ${t('micLabel')}</label>
    <label class="toggle"><input type="checkbox" data-setting="chat" ${st.chat ? 'checked' : ''}> ${t('chatLabel')}</label>
    ${st.chat ? '' : banner('err', t('chatOff'))}
  </main>`;
}

const chatOffWarning = () => s.askChatOff
  ? banner('err', t('chatConfirm'), `${b('small', t('confirmOff'), 'chatOff')}${b('small', t('keepOn'), 'keepChat')}`) : '';

function render() {
  app.innerHTML = (s.view === 'settings' ? settingsView() : mainView()).replace('<main>', `<main>${chatOffWarning()}`);
  if (s.view === 'settings') fillModels();
}

let models;
async function fillModels() {
  models ??= listModels().catch(() => []);
  const list = document.getElementById('models');
  (await models).forEach((id) => list?.append(Object.assign(document.createElement('option'), { value: id })));
}

// ---------- actions ----------

const actions = {
  async start() {
    s.error = null;
    const res = await sw('start', { tabId: s.tabId });
    if (!res?.ok) s.error = res?.error === 'not-meet' ? t('err_notmeet') : res?.error === 'busy' ? t('err_busy') : t('err_capture', res?.error ?? '');
  },
  pause: () => sw('pause'),
  resume: () => sw('resume'),
  stop: () => sw('stop'),
  again: () => sw('summarize-again'),
  showFiles: () => chrome.downloads.show(s.latest.videoDownloadId),
  settings() { s.view = 'settings'; },
  back() { s.view = 'main'; },
  allowMic: () => chrome.tabs.create({ url: chrome.runtime.getURL('src/permissions/permissions.html') }),
  async toggle(key) {
    const next = !s.settings[key];
    if (key === 'chat' && !next) { s.askChatOff = true; return; }
    await saveSetting(key, next);
  },
  async chatOff() { s.askChatOff = false; await saveSetting('chat', false); },
  keepChat() { s.askChatOff = false; },
};

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  await actions[el.dataset.a](el.dataset.arg);
  render();
});

app.addEventListener('change', async (e) => {
  const key = e.target.dataset.setting;
  if (!key) return;
  let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
  if (key === 'chat' && !value) { e.target.checked = true; s.askChatOff = true; render(); return; }
  if (key === 'model' && !value) value = DEFAULT_MODEL;
  await saveSetting(key, value);
});

// ---------- live updates ----------

chrome.storage.onChanged.addListener(async () => {
  await loadStorage();
  if (s.view === 'main') render(); // settings view keeps its inputs; values are already saved
});
chrome.tabs.onActivated.addListener(async () => { await loadTab(); render(); });
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (tabId === s.tabId && (info.url || info.status === 'complete')) { await loadTab(); render(); }
});

setInterval(() => {
  const el = document.getElementById('timer');
  if (el && s.rec.clock) el.textContent = fmt(videoMs(s.rec.clock, Date.now()));
}, 1000);
setInterval(async () => { if ((await pollPage()) && s.view === 'main') render(); }, 2000);

const perm = await navigator.permissions.query({ name: 'microphone' });
s.mic = perm.state;
perm.onchange = () => { s.mic = perm.state; if (s.view === 'main') render(); };

await Promise.all([loadTab(), loadStorage()]);
render();
