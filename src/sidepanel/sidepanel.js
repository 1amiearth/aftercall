import { SETTINGS } from '../lib/settings.js';
import { meetCodeFromUrl, talkShare, when } from '../lib/transcript.js';
import { videoMs, fmt } from '../lib/clock.js';
import { ping, PROVIDERS, slackMessage } from '../lib/summary.js';
import { captionHealth, speech } from '../lib/health.js';

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
  catchup: null, // { status, at, result?, kind? } summary of the recording so far
  mic: 'prompt',
  error: null,
  askChatOff: false, // turning the chat notice off needs a second click on a warning
  askDelete: false, // so does deleting a recording
  unreadablePolls: 0,
  shortcuts: {}, // command name -> key, e.g. { 'toggle-recording': '⌥⇧R' }
  flash: null, // short confirmation, e.g. after a mark
  host: undefined, // { clis: { claude, codex } (version or null), models: { claude: [{ id, name }], codex: [...] } }; { error } = host not reachable, undefined = checking
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
  s.unreadablePolls = s.page?.seen && !s.page.parsed ? s.unreadablePolls + 1 : 0;
  return JSON.stringify(s.page) !== before;
}

async function loadStorage() {
  s.settings = { ...SETTINGS, ...(await chrome.storage.local.get(Object.keys(SETTINGS))) };
  s.latest = (await chrome.storage.local.get('latest')).latest ?? null;
  const session = await chrome.storage.session.get(['rec', 'startError', 'catchup']);
  s.rec = session.rec ?? { phase: 'idle' };
  s.catchup = session.catchup ?? null;
  if (session.startError) s.error = startErrorText(session.startError);
}

const startErrorText = (e) => (e === 'not-meet' ? t('err_notmeet') : e === 'busy' ? t('err_busy')
  : /invoked/i.test(e) ? t('err_invoke') : t('err_capture', e));

async function checkHost() {
  s.host = undefined;
  render();
  s.host = await ping();
  render();
}

const GUIDE = 'https://github.com/1amiearth/aftercall/blob/main/docs/ai-connect.md';
const INSTALL = { claude: 'npm install -g @anthropic-ai/claude-code && claude', codex: 'npm install -g @openai/codex && codex login' };
const cliVersion = () => s.host?.clis?.[s.settings.provider];
const modelName = () => { const { provider, aiModel } = s.settings; return !aiModel ? t('modelDefault') : s.host?.models?.[provider]?.find((m) => m.id === aiModel)?.name ?? aiModel; };

const saveSetting = (key, value) => chrome.storage.local.set({ [key]: value });
const sw = (type, extra = {}) => chrome.runtime.sendMessage({ target: 'sw', type, ...extra });

// ---------- pieces ----------

const b = (cls, text, action, arg = '', disabled = false) =>
  `<button class="${cls}" data-a="${action}" data-arg="${esc(arg)}" ${disabled ? 'disabled' : ''}>${text}</button>`;
const btn = (text, action, arg) => b('btn', esc(text), action, arg);
const link = (text, action, arg) => b('link', esc(text), action, arg);
const note = (kind, text, action = '') => `<div class="note ${kind}" role="status"><span>${esc(text)}</span>${action}</div>`;
const flash = () => (s.flash ? `<p class="hint" role="status">${esc(s.flash)}</p>` : '');
// Kinds from 0.1.0 have no message now.
const failText = (kind) => t(chrome.i18n.getMessage(`fail_${kind}`) ? `fail_${kind}` : 'fail_retry', PROVIDERS[s.settings.provider]);

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
    s.host === undefined ? ['warn', t('ai'), t('aiChecking')]
      : cliVersion() ? ['ok', t('ai'), [PROVIDERS[st.provider], modelName(), st.aiEffort].filter(Boolean).join(' · ')]
      : ['off', t('ai'), t(s.host.error ? 'aiNoHost' : 'aiNoCli', PROVIDERS[st.provider]), link(t('connect'), 'settings')],
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
    ${blocked ? `<p class="hint">${esc(busyElsewhere ? t('err_busy') : t('meetTabNone'))}</p>`
      : s.shortcuts['toggle-recording'] ? `<p class="hint">${esc(t('shortcutStart', s.shortcuts['toggle-recording']))}</p>` : ''}`;
}

function recordingView() {
  const paused = s.rec.phase === 'paused';
  const marks = s.latest?.lines?.filter((l) => l.mark).length ?? 0;
  const lines = s.latest?.lines?.slice(-3) ?? [];
  const warns = [
    s.page ? { off: note('warn', t('ccOffWarn')), unreadable: note('err', t('capUnreadable')), quiet: note('warn', t('capQuiet')), ok: '' }[
      captionHealth({ cc: s.page.cc, unreadablePolls: s.unreadablePolls, quietMs: videoMs(s.rec.clock, Date.now()) - (speech(s.latest?.lines ?? []).at(-1)?.t ?? 0) })] : '',
    s.settings.mic && s.latest?.micOk === false ? note('warn', t('micFailedWarn')) : '',
  ].join('');
  return `<section class="onair ${paused ? 'paused' : ''}" aria-live="polite">
      <div class="onair-state"><span class="pulse"></span>${t(paused ? 'paused' : 'recording')}</div>
      <div class="timer" id="timer">${fmt(videoMs(s.rec.clock, Date.now()))}</div>
      <div class="controls">${paused ? btn(t('resume'), 'resume') : btn(t('pause'), 'pause')}${b('btn primary', esc(t('stop')), 'stop')}</div>
      ${paused ? '' : `<button class="btn mark" data-a="mark">⭐ ${esc(t('markMoment'))}${marks ? ` (${marks})` : ''}</button>`}
      ${s.flash ? flash() : s.shortcuts['mark-moment'] && !paused ? `<p class="hint">${esc(t('shortcutMark', s.shortcuts['mark-moment']))}</p>` : ''}
    </section>
    ${warns}
    <section class="captions"><h2>${t('lastCaptions')}</h2>
      ${lines.length
        ? lines.map((l) => `<div class="line"><time>${fmt(l.t)}</time><div>${l.mark ? `⭐ <b>${esc(l.text)}</b>` : `<b>${esc(l.speaker)}</b> ${esc(l.text)}`}</div></div>`).join('')
        : `<div class="empty">${t('noCaptions')}</div>`}
    </section>
    ${catchupView()}`;
}

// Brief, decisions and action items only: the full summary is for after the meeting.
function catchupView() {
  const c = s.catchup;
  const ask = b('btn', esc(t('catchUp')), 'catchUp', '', c?.status === 'running');
  if (!c) return `<div class="actions">${ask}</div>`;
  if (c.status === 'running') return note('info', t('catchUpRunning'));
  if (c.status === 'failed') return `${note('err', failText(c.kind))}<div class="actions">${ask}</div>`;
  const j = c.result;
  const list = (items) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return `<section class="latest catchup">
    <div class="latest-head"><h2>${esc(t('catchUpTitle', fmt(c.at)))}</h2>${link(t('copySlack'), 'copySlackCatchup')}</div>
    <p>${esc(j.brief)}</p>
    ${j.decisions.length ? `<h3>${esc(t('decisions'))}</h3>${list(j.decisions)}` : ''}
    ${j.action_items.length ? `<h3>Action items</h3>${list(j.action_items.map((a) => `${a.task} (${a.owner} · ${a.deadline})`))}` : ''}
    <div class="actions">${ask}</div>
  </section>`;
}

function talkView(lines) {
  const talk = talkShare(lines);
  if (talk.length < 2) return '';
  const pct = (x) => `${Math.round(x.share * 100)}%`;
  return `<div class="talk"><h3>${esc(t('talkTitle'))}</h3>${talk.map((x) =>
    `<div class="talk-row"><span class="who">${esc(x.speaker)}</span><span class="bar"><i style="width:${pct(x)}"></i></span><span class="pct">${pct(x)}</span></div>`).join('')}</div>`;
}

function latestView() {
  const l = s.latest;
  if (!l || l.summary?.status === 'none') return '';
  const sum = l.summary;
  const canSummarize = speech(l.lines).length && sum.status !== 'running';
  const summarize = !canSummarize ? '' : sum.status === 'done' ? btn(t('summarizeAgain'), 'summarize') : b('btn primary', esc(t('summarize')), 'summarize');
  const status = {
    running: note('info', t('summaryRunning')),
    empty: note('warn', t('summaryEmpty')),
    failed: note('err', failText(sum.kind),
      ['nohost', 'nocli', 'auth', 'model'].includes(sum.kind) ? link(t('connect'), 'settings') : ''),
  }[sum.status] ?? '';
  const hasSummary = sum.status === 'done';
  const result = hasSummary && sum.result; // absent for summaries made before copy existed
  const file = (type, name, there = true) => `<li class="${there ? '' : 'missing'}"><span class="ftype">${type}</span>${name}</li>`;
  return `<section class="latest">
    <div class="latest-head"><h2>${t('latest')} ${esc(l.meetCode)}</h2><span class="dur">${fmt(l.durationMs)}</span></div>
    ${status}
    <ul class="files">${file('WEBM', 'recording.webm', !!l.videoDownloadId)}${file('HTML', 'review.html', l.reviewDownloadId != null)}${file('MD', 'transcript.md')}${file('MD', 'summary.md', hasSummary)}</ul>
    ${talkView(l.lines)}
    ${result ? `<div class="actions">${btn(t('copySlack'), 'copySlack')}</div>` : ''}
    ${flash()}
    ${s.askDelete
      ? `<div class="note err" role="alert"><span>${esc(t('deleteConfirm'))}</span></div>
         <div class="actions">${b('btn danger-fill', esc(t('deleteYes')), 'deleteYes')}${btn(t('cancel'), 'deleteNo')}</div>`
      : `<div class="actions">${summarize}${l.videoDownloadId ? btn(t('showFiles'), 'showFiles') : ''}
         ${sum.status !== 'running' ? b('btn danger', esc(t('deleteRecording')), 'deleteAsk') : ''}</div>`}
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
    <label class="field">${t('providerLabel')}
      <select data-setting="provider">${Object.entries(PROVIDERS).map(([id, name]) => `<option value="${id}" ${st.provider === id ? 'selected' : ''}>${name}</option>`).join('')}</select>
      <span class="sub">${t('providerNote')}</span></label>
    <label class="field">${t('modelLabel')}
      <select data-setting="aiModel">${modelOptions()}</select>
      <span class="sub">${t('modelHint', PROVIDERS[st.provider])}</span></label>
    <label class="field">${t('effortLabel')}
      <select data-setting="aiEffort">${effortOptions()}</select>
      <span class="sub">${t('effortHint')}</span></label>
    <label class="field">${t('notesLabel')}
      <textarea data-setting="aiNotes" rows="3" maxlength="1000" placeholder="${esc(t('notesPlaceholder'))}">${esc(st.aiNotes)}</textarea>
      <span class="sub">${t('notesHint')}</span></label>
    <label class="field">${t('nameLabel')}
      <input data-setting="selfName" value="${esc(st.selfName)}">
      <span class="sub">${t('nameHint')}</span></label>
    <label class="switch">${t('micLabel')}<input type="checkbox" role="switch" data-setting="mic" ${st.mic ? 'checked' : ''}></label>
    <label class="switch">${t('chatLabel')}<input type="checkbox" role="switch" data-setting="chat" ${st.chat ? 'checked' : ''}></label>
  </section>
  ${connectView()}
  ${st.chat ? '' : note('err', t('chatOff'))}</main>`;
}

// CLI default first, then what the host reports; a saved model missing from the list stays selectable.
function modelOptions() {
  const { provider, aiModel } = s.settings;
  const list = [{ id: '', name: t('modelDefault') }, ...(s.host?.models?.[provider] ?? [])];
  if (aiModel && !list.some((m) => m.id === aiModel)) list.push({ id: aiModel, name: aiModel });
  return list.map((m) => `<option value="${esc(m.id)}" ${m.id === aiModel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
}

// Effort levels the chosen model takes; with the CLI default model, every level any of its models takes.
function efforts() {
  const { provider, aiModel } = s.settings;
  const models = (s.host?.models?.[provider] ?? []).filter((m) => !aiModel || m.id === aiModel);
  return [...new Set(models.flatMap((m) => m.efforts ?? []))];
}

function effortOptions() {
  const { aiEffort } = s.settings;
  const list = ['', ...efforts()];
  if (!list.includes(aiEffort)) list.push(aiEffort);
  return list.map((x) => `<option value="${esc(x)}" ${x === aiEffort ? 'selected' : ''}>${esc(x || t('modelDefault'))}</option>`).join('');
}

// Setup steps until the host answers with the chosen CLI, then a short how-to.
function connectView() {
  const name = PROVIDERS[s.settings.provider];
  const code = (c) => `<code>${esc(c)}</code>`;
  const install = `native/install.sh ${chrome.runtime.id}`;
  const status = s.host === undefined ? note('info', t('aiChecking'))
    : cliVersion() ? note('ok', t('aiConnected', name, cliVersion()))
    : note('warn', s.host.error ? `${t('aiNoHost')} (${s.host.error})` : t('aiNoCli', name));
  const steps = cliVersion()
    ? [t('use1'), t('use2'), t('use3', name)]
    : [`${esc(t('step1', name))}${code(INSTALL[s.settings.provider])}`,
      `${esc(t('step2'))}${code(install)}${b('link', esc(t('copy')), 'copy', install)}`,
      esc(t('step3'))];
  return `<section class="fields connect"><h2>${t(cliVersion() ? 'howToUse' : 'connectTitle')}</h2>${status}
    <ol class="steps">${steps.map((x) => `<li>${cliVersion() ? esc(x) : x}</li>`).join('')}</ol>
    <div class="actions">${btn(t('testConnection'), 'testHost')}${link(t('guide'), 'guide')}</div>
    ${flash()}</section>`;
}

const chatOffWarning = () => s.askChatOff
  ? `<div class="note err" role="alert"><span>${esc(t('chatConfirm'))}</span></div>
     <div class="actions">${b('btn primary', esc(t('confirmOff')), 'chatOff')}${btn(t('keepOn'), 'keepChat')}</div>` : '';

function render() {
  app.innerHTML = (s.view === 'settings' ? settingsView() : mainView()).replace('<main>', `<main>${chatOffWarning()}`);
}

// ---------- actions ----------

// HTML for apps that keep formatting on paste (Slack, Notion, email), plain text for the rest.
async function copyRich({ text, html }) {
  await navigator.clipboard.write([new ClipboardItem({
    'text/plain': new Blob([text], { type: 'text/plain' }),
    'text/html': new Blob([html], { type: 'text/html' }),
  })]);
  s.flash = t('copied');
  setTimeout(() => { s.flash = null; render(); }, 2500);
}

const actions = {
  async start() {
    s.error = null;
    await chrome.storage.session.set({ startError: null });
    const res = await sw('start', { tabId: s.tabId });
    if (!res?.ok) s.error = startErrorText(res?.error ?? '');
  },
  async mark() {
    const res = await sw('mark');
    if (!res?.ok) return;
    s.flash = t('marked', fmt(res.t));
    setTimeout(() => { s.flash = null; if (s.view === 'main') render(); }, 2500);
  },
  pause: () => sw('pause'),
  resume: () => sw('resume'),
  stop: () => sw('stop'),
  async summarize() {
    s.error = null;
    const res = await sw('summarize');
    if (!res?.ok) s.error = { empty: t('summaryEmpty'), busy: t('err_busy') }[res?.error] ?? t('fail_retry');
  },
  async catchUp() {
    s.error = null;
    const res = await sw('catchup');
    if (!res?.ok && res?.error === 'empty') s.error = t('summaryEmpty');
  },
  copySlack: () => copyRich(slackMessage(s.latest.summary.result, when(s.latest))),
  copySlackCatchup: () => copyRich(slackMessage(s.catchup.result, `00:00–${fmt(s.catchup.at)}`)),
  showFiles: () => chrome.downloads.show(s.latest.videoDownloadId),
  deleteAsk() { s.askDelete = true; },
  deleteNo() { s.askDelete = false; },
  async deleteYes() {
    s.askDelete = false;
    const res = await sw('delete-latest');
    if (!res?.ok) s.error = t('err_busy');
  },
  settings() { s.view = 'settings'; checkHost(); },
  testHost: () => checkHost(),
  guide: () => chrome.tabs.create({ url: GUIDE }),
  async copy(text) {
    await navigator.clipboard.writeText(text);
    s.flash = t('copied');
    setTimeout(() => { s.flash = null; render(); }, 2500);
  },
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
  const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
  if (key === 'chat' && !value) { e.target.checked = true; s.askChatOff = true; render(); return; }
  if (key === 'provider' || key === 'aiModel') { // model names do not carry over between CLIs, nor effort levels between models
    const next = key === 'provider' ? { provider: value, aiModel: '', aiEffort: '' } : { aiModel: value };
    Object.assign(s.settings, next);
    if (key === 'aiModel' && s.host && !efforts().includes(s.settings.aiEffort)) s.settings.aiEffort = next.aiEffort = '';
    await chrome.storage.local.set(next);
    render();
    return;
  }
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
setInterval(async () => { if (((await pollPage()) || live()) && s.view === 'main') render(); }, 2000); // live: caption health depends on time

for (const c of await chrome.commands.getAll()) s.shortcuts[c.name] = c.shortcut;

const perm = await navigator.permissions.query({ name: 'microphone' });
s.mic = perm.state;
perm.onchange = () => { s.mic = perm.state; if (s.view === 'main') render(); };

await Promise.all([loadTab(), loadStorage()]);
render();
checkHost();
