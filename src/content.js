// Runs on Google Meet and Microsoft Teams (web): reads live captions, posts the chat notice, notices leaving the call.
// Every page selector lives in the meet and teams tables. When Google or Microsoft changes the page, fix it there.
(async () => {
  const { createUtteranceTracker } = await import(chrome.runtime.getURL('src/lib/utterance.js'));

  const label = (el) => el.getAttribute('aria-label') || '';
  const button = (re) => [...document.querySelectorAll('button[aria-label]')].find((b) => re.test(label(b)));

  // Chat, leave and CC-button labels were seen in the ticket 02 probe (English UI); Thai labels are guesses.
  // ponytail: caption structure (one child per bubble, speaker first) is unconfirmed until a ticket 02 export with captions.
  const meet = {
    captionRegion: () => [...document.querySelectorAll('[role="region"][aria-label]')].find((n) => /caption|คำบรรยาย/i.test(label(n))),
    captionsOnButton: () => button(/turn off captions|ปิดคำบรรยาย/i),
    leaveButton: () => button(/leave call|ออกจากการโทร|ออกจากสาย|วางสาย/i),
    chatButton: () => button(/chat with everyone|แชทกับทุกคน/i),
    chatBox: () => document.querySelector('textarea[aria-label]'),
    write(box, text) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    },
    sendButton(box) {
      for (let a = box.parentElement; a; a = a.parentElement) {
        const b = [...a.querySelectorAll('button[aria-label]')].find((x) => x.getAttribute('role') !== 'switch' && /send|ส่ง/i.test(label(x)));
        if (b) return b;
      }
      return null;
    },
    /** One block per caption bubble: first text is the speaker, the rest is what they said. */
    readBlocks: (region) =>
      [...region.children]
        .map((el) => { const t = textLeaves(el); return { key: el, speaker: t[0] ?? '', text: t.slice(1).join(' ') }; })
        .filter((b) => b.speaker && b.text),
  };

  // From a probe of the browser join page (light-meetings) in English, 2026-10: data-tid attributes do not change with the UI language.
  // ponytail: Leave and Chat were not found by data-tid or aria-label in the probe, so they go by id, label or text; the Thai words are guesses.
  const control = (re) => [...document.querySelectorAll('button, [role="button"]')].find((b) => re.test(label(b) || b.textContent.trim()));
  const teams = {
    captionRegion: () => document.querySelector('[data-tid="closed-caption-renderer-wrapper"]'),
    captionsOnButton: () => document.querySelector('[data-tid="closed-captions-turn-off-button"]'),
    leaveButton: () => document.querySelector('[id*="hangup"], [data-tid*="hangup"]') ?? control(/^(leave|ออก)/i),
    chatButton: () => control(/^(chat|แชท)$/i),
    chatBox: () => document.querySelector('[data-tid="ckeditor"]'),
    write(box, text) {
      box.focus();
      document.execCommand('insertText', false, text); // CKEditor takes typed input, not a value
    },
    sendButton: () => document.querySelector('[data-tid="newMessageCommands-send"]'),
    // Each bubble keeps its caption-text node while Teams rewrites the words, so that node is the bubble's identity.
    // ponytail: the list is virtualized; bubbles scrolled back into view get new nodes and are emitted again. Key by speaker + start text if that shows up.
    readBlocks: (region) =>
      [...region.querySelectorAll('[data-tid="closed-caption-text"]')]
        .map((el) => ({ key: el, speaker: el.closest('.fui-ChatMessageCompact')?.querySelector('[data-tid="author"]')?.textContent.trim() ?? '', text: el.textContent.trim() }))
        .filter((b) => b.speaker && b.text),
  };

  const SITE = location.hostname === 'teams.microsoft.com' ? teams : meet;

  const NOTICE = '🔴 AfterCall กำลังบันทึกการประชุมนี้และจะสรุปด้วย AI · AfterCall is recording this meeting and will summarize it with AI';

  const send = (m) => chrome.runtime.sendMessage({ target: 'sw', ...m }).catch(() => {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function textLeaves(el) {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const s = w.currentNode.textContent.trim(); if (s) out.push(s); }
    return out;
  }

  let tracker = null, region = null, observer = null, paused = false, wasInCall = false;
  const read = () => tracker && !paused && region && tracker.update(SITE.readBlocks(region));

  function startCapture(isPaused = false) {
    tracker = createUtteranceTracker({ emit: (u) => send({ type: 'utterance', ...u }) });
    paused = isPaused;
  }

  function stopCapture() {
    tracker?.flush();
    tracker = null;
    observer?.disconnect();
    observer = region = null;
  }

  setInterval(() => {
    if (tracker) {
      const r = SITE.captionRegion() ?? null;
      if (r !== region) {
        observer?.disconnect();
        observer = null;
        region = r;
        if (r) {
          observer = new MutationObserver(read);
          observer.observe(r, { childList: true, subtree: true, characterData: true });
          read();
        } else if (!paused) {
          tracker.update([]); // CC turned off: close what was open
        }
      }
      if (!paused) tracker.tick();
    }
    const inCall = !!SITE.leaveButton();
    if (tracker && wasInCall && !inCall) send({ type: 'left-meeting' });
    wasInCall = inCall;
  }, 250);

  async function postNotice() {
    let box = SITE.chatBox();
    const opened = !box;
    if (opened) {
      SITE.chatButton()?.click();
      for (let i = 0; i < 30 && !(box = SITE.chatBox()); i++) await sleep(100);
    }
    if (!box) return;
    box.focus();
    SITE.write(box, NOTICE);
    await sleep(200);
    const btn = SITE.sendButton(box);
    if (btn && !btn.disabled) btn.click();
    else box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    if (opened) { await sleep(500); SITE.chatButton()?.click(); } // put the chat panel back the way it was
  }

  chrome.runtime.onMessage.addListener((m, _sender, reply) => {
    if (m.type === 'rec:start') { startCapture(); if (m.chat) postNotice(); }
    if (m.type === 'rec:pause') { tracker?.flush(); paused = true; }
    if (m.type === 'rec:resume') paused = false;
    if (m.type === 'rec:stop') stopCapture(); // flushes the last lines before we reply
    if (m.type === 'status') {
      const r = SITE.captionRegion();
      return reply({
        cc: !!r || !!SITE.captionsOnButton(),
        inCall: !!SITE.leaveButton(),
        seen: !!r?.innerText.trim(), // captions on screen…
        parsed: r ? SITE.readBlocks(r).length : 0, // …and how many bubbles we could read
      });
    }
    reply({ ok: true });
  });

  // The Meet tab was reloaded mid-recording: pick the captions back up.
  const hello = await send({ type: 'hello' });
  if (hello?.recording) startCapture(hello.paused);
})();
