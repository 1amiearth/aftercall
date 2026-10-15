// Runs on meet.google.com: reads live captions, posts the chat notice, notices leaving the call.
// Every Meet selector lives in MEET. When Google changes the page, fix it there.
(async () => {
  const { createUtteranceTracker } = await import(chrome.runtime.getURL('src/lib/utterance.js'));
  const { createCaptionLog, capturePage } = await import(chrome.runtime.getURL('src/lib/debug.js'));

  const label = (el) => el.getAttribute('aria-label') || '';
  const button = (re) => [...document.querySelectorAll('button[aria-label]')].find((b) => re.test(label(b)));

  // Chat, leave and CC-button labels were seen in the ticket 02 probe (English UI); Thai labels are guesses.
  // ponytail: caption structure (one child per bubble, speaker first) is unconfirmed until a ticket 02 export with captions.
  const MEET = {
    captionRegion: () => [...document.querySelectorAll('[role="region"][aria-label]')].find((n) => /caption|คำบรรยาย/i.test(label(n))),
    captionsOnButton: () => button(/turn off captions|ปิดคำบรรยาย/i),
    leaveButton: () => button(/leave call|ออกจากการโทร|ออกจากสาย|วางสาย/i),
    chatButton: () => button(/chat with everyone|แชทกับทุกคน/i),
    chatBox: () => document.querySelector('textarea[aria-label]'),
    sendButton(box) {
      for (let a = box.parentElement; a; a = a.parentElement) {
        const b = [...a.querySelectorAll('button[aria-label]')].find((x) => x.getAttribute('role') !== 'switch' && /send|ส่ง/i.test(label(x)));
        if (b) return b;
      }
      return null;
    },
  };

  const NOTICE = '🔴 AfterCall กำลังบันทึกการประชุมนี้และจะสรุปด้วย AI · AfterCall is recording this meeting and will summarize it with AI';

  const send = (m) => chrome.runtime.sendMessage({ target: 'sw', ...m }).catch(() => {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function textLeaves(el) {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const s = w.currentNode.textContent.trim(); if (s) out.push(s); }
    return out;
  }

  /** One block per caption bubble: first text is the speaker, the rest is what they said. */
  const readBlocks = (region) =>
    [...region.children]
      .map((el) => { const t = textLeaves(el); return { key: el, speaker: t[0] ?? '', text: t.slice(1).join(' ') }; })
      .filter((b) => b.speaker && b.text);

  let tracker = null, region = null, observer = null, paused = false, wasInCall = false;
  const read = () => {
    if (!tracker || paused || !region) return;
    const blocks = readBlocks(region);
    counts.reads++;
    counts.parsed = blocks.length;
    log?.snapshot(blocks);
    tracker.update(blocks);
  };

  // Debug mode (settings): counters for the side panel, and a caption log the offscreen document keeps until Stop.
  let debugOn = false, log = null, flushedAt = 0;
  const counts = { reads: 0, parsed: 0, emitted: 0, noRegion: 0 };
  chrome.storage.local.get('debug').then((r) => (debugOn = !!r.debug));
  chrome.storage.onChanged.addListener((c) => { if (c.debug) debugOn = !!c.debug.newValue; });
  const flushLog = () => {
    flushedAt = Date.now();
    const entries = log?.take();
    return entries?.length ? chrome.runtime.sendMessage({ target: 'offscreen', type: 'debug-log', entries }).catch(() => {}) : Promise.resolve();
  };

  function startCapture(isPaused = false) {
    log = debugOn ? createCaptionLog({ meta: { site: 'meet', url: location.origin + location.pathname, lang: document.documentElement.lang } }) : null;
    tracker = createUtteranceTracker({
      emit: (u, why) => {
        counts.emitted++;
        log?.emit(u, why);
        send({ type: 'utterance', ...u });
      },
    });
    paused = isPaused;
  }

  function stopCapture() {
    tracker?.flush();
    tracker = null;
    observer?.disconnect();
    observer = region = null;
    log?.state('stop');
    const done = flushLog();
    log = null;
    return done;
  }

  setInterval(() => {
    if (tracker) {
      const r = MEET.captionRegion() ?? null;
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
      if (region && !paused) log?.snapshot(readBlocks(region)); // keeps the last state of a burst the throttle skipped
      if (!region) counts.noRegion++;
      if (log && Date.now() - flushedAt > 5000) flushLog();
    }
    const inCall = !!MEET.leaveButton();
    if (tracker && wasInCall && !inCall) send({ type: 'left-meeting' });
    wasInCall = inCall;
  }, 250);

  async function postNotice() {
    let box = MEET.chatBox();
    const opened = !box;
    if (opened) {
      MEET.chatButton()?.click();
      for (let i = 0; i < 30 && !(box = MEET.chatBox()); i++) await sleep(100);
    }
    if (!box) return;
    box.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, NOTICE);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200);
    const btn = MEET.sendButton(box);
    if (btn && !btn.disabled) btn.click();
    else box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    if (opened) { await sleep(500); MEET.chatButton()?.click(); } // put the chat panel back the way it was
  }

  chrome.runtime.onMessage.addListener((m, _sender, reply) => {
    if (m.type === 'rec:start') { startCapture(); if (m.chat) postNotice(); }
    if (m.type === 'rec:pause') { tracker?.flush(); paused = true; log?.state('pause'); }
    if (m.type === 'rec:resume') { paused = false; log?.state('resume'); }
    if (m.type === 'rec:stop') { stopCapture().then(() => reply({ ok: true })); return true; } // last lines and log out before we reply
    if (m.type === 'status') {
      const r = MEET.captionRegion();
      const blocks = r ? readBlocks(r) : [];
      return reply({
        cc: !!r || !!MEET.captionsOnButton(),
        inCall: !!MEET.leaveButton(),
        seen: !!r?.innerText.trim(), // captions on screen…
        parsed: blocks.length, // …and how many bubbles we could read
        debug: debugOn ? { ...counts, region: !!r, logging: !!log, last: blocks.at(-1) && { speaker: blocks.at(-1).speaker, text: blocks.at(-1).text.slice(-80) } } : null,
      });
    }
    if (m.type === 'capture') {
      const r = MEET.captionRegion() ?? null;
      return reply(capturePage({
        doc: document, site: 'meet', region: r, blocks: r ? readBlocks(r) : [],
        found: { region: !!r, cc: !!MEET.captionsOnButton(), leave: !!MEET.leaveButton(), chatButton: !!MEET.chatButton(), chatBox: !!MEET.chatBox() },
      }));
    }
    reply({ ok: true });
  });

  // The Meet tab was reloaded mid-recording: pick the captions back up.
  const hello = await send({ type: 'hello' });
  if (hello?.recording) startCapture(hello.paused);
})();
