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
  `<button class="${cls}" data-a="${action}" data-arg="${esc(arg)}" ${disabled ? 'disabled' : ''}>${text}</button>`;
const btn = (text, action, arg) => b('btn', esc(text), action, arg);
const link = (text, action, arg) => b('link', esc(text), action, arg);
const note = (kind, text, action = '') => `<div class="note ${kind}" role="status"><span>${esc(text)}</span>${action}</div>`;

const ICON = {
  ok: '<path d="M6 10.3l2.6 2.6L14 7.6"/>',
  warn: '<path d="M10 5.8v5"/><path d="M10 14.2v.01"/>',
  err: '<path d="M6.5 10h7"/>',
  off: '<path d="M7 10h6"/>',
};
const icon = (state) => `<svg class="ic ${state}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"/>${ICON[state]}</svg>`;
const GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';

const item = (state, title, detail, fix = '') =>
  `<div class="item ${state}">${icon(state)}<div><div class="title">${esc(title)}</div><div class="detail">${esc(detail)}</div></div>${fix}</div>`;

const live = () => ['recording', 'paused'].includes(s.rec.phase);
const recordingHere = () => s.rec.tabId === s.tabId;

function checklist() {
  const { settings: st, page } = s;
  const rows = [
    !s.meetCode ? ['err', t('meetTab'), t('meetTabNone')]
      : !page ? ['warn', t('meetTab'), t('meetReload')]
      : ['ok', t('meetTab'), s.meetCode],
    page?.cc ? ['ok', t('cc'), t('ccOn')] : ['warn', t('cc'), t('ccOff')],
    st.apiKey ? ['ok', t('apiKey'), st.model || DEFAULT_MODEL] : ['off', t('apiKey'), t('apiKeyMissing'), link(t('addKey'), 'settings')],
    st.selfName ? ['ok', t('selfName'), st.selfName] : ['warn', t('selfName'), t('selfNameMissing'), link(t('setName'), 'settings')],
    !st.mic ? ['ok', t('mic'), t('micOff'), link(t('turnOn'), 'toggle', 'mic')]
      : s.mic === 'granted' ? ['ok', t('mic'), t('micOn'), link(t('turnOff'), 'toggle', 'mic')]
      : ['warn', t('mic'), t('micAsk'), link(t('allow'), 'allowMic')],
    st.chat ? ['ok', t('chat'), t('chatOn'), link(t('turnOff'), 'toggle', 'chat')] : ['warn', t('chat'), t('chatOff'), link(t('turnOn'), 'toggle', 'chat')],
  ];
  const ready = rows.filter((r) => r[0] === 'ok').length;
  return `<section class="setup" aria-label="${esc(t('checklist'))}">
    <div class="setup-head"><h2>${t('checklist')}</h2><span class="count">${t('readyCount', ready, rows.length)}</span></div>
    ${rows.map((r) => item(...r)).join('')}</section>`;
}

function startButton() {
  const busyElsewhere = live() && !recordingHere();
  const blocked = !s.meetCode || busyElsewhere;
  return `${b('btn primary big', `<span class="rec-dot"></span>${esc(t('start'))}`, 'start', '', blocked)}
    ${blocked ? `<p class="hint">${esc(busyElsewhere ? t('err_busy') : t('meetTabNone'))}</p>` : ''}`;
}

function recordingView() {
  const paused = s.rec.phase === 'paused';
  const lines = s.latest?.lines?.slice(-3) ?? [];
  const warns = [
    s.page && !s.page.cc ? note('warn', t('ccOffWarn')) : '',
    s.settings.mic && s.latest?.micOk === false ? note('warn', t('micFailedWarn')) : '',
  ].join('');
  return `<section class="onair ${paused ? 'paused' : ''}" aria-live="polite">
      <div class="onair-state"><span class="pulse"></span>${t(paused ? 'paused' : 'recording')}</div>
      <div class="timer" id="timer">${fmt(videoMs(s.rec.clock, Date.now()))}</div>
      <div class="controls">${paused ? btn(t('resume'), 'resume') : btn(t('pause'), 'pause')}${b('btn primary', esc(t('stop')), 'stop')}</div>
    </section>
    ${warns}
    <section class="captions"><h2>${t('lastCaptions')}</h2>
      ${lines.length
        ? lines.map((l) => `<div class="line"><time>${fmt(l.t)}</time><div><b>${esc(l.speaker)}</b> ${esc(l.text)}</div></div>`).join('')
        : `<div class="empty">${t('noCaptions')}</div>`}
    </section>`;
}

function latestView() {
  const l = s.latest;
  if (!l || l.summary?.status === 'none') return '';
  const sum = l.summary;
  const canSummarize = l.lines.length && sum.status !== 'running';
  const summarize = !canSummarize ? '' : sum.status === 'done' ? btn(t('summarizeAgain'), 'summarize') : b('btn primary', esc(t('summarize')), 'summarize');
  const status = {
    running: note('info', t('summaryRunning')),
    empty: note('warn', t('summaryEmpty')),
    failed: note('err', t(`fail_${String(sum.kind).replace('-', '')}`)),
  }[sum.status] ?? '';
  const hasSummary = sum.status === 'done';
  const file = (type, name, there = true) => `<li class="${there ? '' : 'missing'}"><span class="ftype">${type}</span>${name}</li>`;
  return `<section class="latest">
    <div class="latest-head"><h2>${t('latest')} ${esc(l.meetCode)}</h2><span class="dur">${fmt(l.durationMs)}</span></div>
    ${status}
    <ul class="files">${file('WEBM', 'recording.webm', !!l.videoDownloadId)}${file('MD', 'transcript.md')}${file('MD', 'summary.md', hasSummary)}</ul>
    <div class="actions">${summarize}${l.videoDownloadId ? btn(t('showFiles'), 'showFiles') : ''}</div>
  </section>`;
}

function mainView() {
  const room = s.meetCode ? `<div class="room">${esc(s.meetCode)}</div>` : `<div class="room none">${t('noMeeting')}</div>`;
  const body = s.rec.phase === 'stopping' ? note('info', t('stopping'))
    : live() && recordingHere() ? recordingView()
    : `${checklist()}${startButton()}`;
  return `<div class="top">${room}<button class="icon-btn" data-a="settings" aria-label="${esc(t('settings'))}">${GEAR}</button></div>
    <main>${s.error ? note('err', s.error) : ''}${body}${live() ? '' : latestView()}</main>`;
}

function settingsView() {
  const st = s.settings;
  return `<div class="top"><button class="icon-btn" data-a="back" aria-label="${esc(t('back'))}">${BACK}</button><div class="room">${t('settings')}</div></div>
  <main><section class="fields">
    <label class="field">${t('keyLabel')}
      <input type="password" data-setting="apiKey" value="${esc(st.apiKey)}" placeholder="sk-or-v1-…" autocomplete="off">
      <span class="sub">${t('keyNote')}</span></label>
    <label class="field">${t('modelLabel')}
      <input list="models" data-setting="model" value="${esc(st.model)}" placeholder="${DEFAULT_MODEL}">
      <datalist id="models"></datalist></label>
    <label class="field">${t('nameLabel')}
      <input data-setting="selfName" value="${esc(st.selfName)}">
      <span class="sub">${t('nameHint')}</span></label>
    <label class="switch">${t('micLabel')}<input type="checkbox" role="switch" data-setting="mic" ${st.mic ? 'checked' : ''}></label>
    <label class="switch">${t('chatLabel')}<input type="checkbox" role="switch" data-setting="chat" ${st.chat ? 'checked' : ''}></label>
  </section>
  ${st.chat ? '' : note('err', t('chatOff'))}</main>`;
}

const chatOffWarning = () => s.askChatOff
  ? `<div class="note err" role="alert"><span>${esc(t('chatConfirm'))}</span></div>
     <div class="actions">${b('btn primary', esc(t('confirmOff')), 'chatOff')}${btn(t('keepOn'), 'keepChat')}</div>` : '';

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
    if (!res?.ok) {
      const e = res?.error ?? '';
      s.error = e === 'not-meet' ? t('err_notmeet') : e === 'busy' ? t('err_busy')
        : /invoked/i.test(e) ? t('err_invoke') : t('err_capture', e);
    }
  },
  pause: () => sw('pause'),
  resume: () => sw('resume'),
  stop: () => sw('stop'),
  async summarize() {
    s.error = null;
    if (!s.settings.apiKey) { s.error = t('needKey'); return; }
    const res = await sw('summarize');
    if (!res?.ok) s.error = { 'no-key': t('needKey'), empty: t('summaryEmpty'), busy: t('err_busy') }[res?.error] ?? t('fail_retry');
  },
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
