// Caption debug mode (setting "debug"): records what the content script saw during a live call,
// so a lost or duplicated caption can be replayed offline, and saves the page structure for fixing selectors.
//
// debug/captions.jsonl, one JSON object per line:
//   { k: 'meta', t, site, url, lang }                           logging started (again after a tab reload: ids restart)
//   { k: 'snap', t, ids: [id...], set: [{ id, speaker, text }] } caption blocks on screen, oldest first;
//                                                               set holds only blocks that are new or changed since the last snap
//   { k: 'emit', t, wall, speaker, text, why }                  an utterance the tracker closed (why: speaker | gone | idle | flush)
//   { k: 'state', t, state }                                    pause | resume | stop | truncated
// debug/emitted.jsonl holds the 'emit' lines only.

// ponytail: ~50k snaps covers 2-3 h of busy captions; after that only emits are logged. Stream to disk if longer calls need full logs.
export const MAX_SNAPS = 50_000;

/**
 * @param {{ meta: object, now?: () => number, max?: number, minGapMs?: number }} opts
 *   minGapMs: snaps closer together are skipped; call snapshot() again on a timer so the last state is never lost
 */
export function createCaptionLog({ meta, now = Date.now, max = MAX_SNAPS, minGapMs = 100 }) {
  const ids = new WeakMap(); // DOM node -> number, so the log shows when a node is kept, replaced or reused
  let nextId = 1;
  const idOf = (key) => {
    if (!ids.has(key)) ids.set(key, nextId++);
    return ids.get(key);
  };
  let pending = [{ k: 'meta', t: now(), ...meta }];
  let prev = new Map(), prevIds = '', lastT = -Infinity, snaps = 0, truncated = false;

  return {
    /** @param {{ key: object, speaker: string, text: string }[]} blocks */
    snapshot(blocks) {
      const t = now();
      if (truncated || t - lastT < minGapMs) return;
      const cur = blocks.map((b) => ({ id: idOf(b.key), speaker: b.speaker, text: b.text }));
      const set = cur.filter((b) => prev.get(b.id)?.speaker !== b.speaker || prev.get(b.id)?.text !== b.text);
      const idList = cur.map((b) => b.id);
      if (!set.length && idList.join() === prevIds) return;
      prev = new Map(cur.map((b) => [b.id, b]));
      prevIds = idList.join();
      lastT = t;
      pending.push({ k: 'snap', t, ids: idList, set });
      if (++snaps >= max) {
        truncated = true;
        pending.push({ k: 'state', t, state: 'truncated' });
      }
    },
    emit(u, why) { pending.push({ k: 'emit', t: now(), ...u, why }); },
    state(state) { pending.push({ k: 'state', t: now(), state }); },
    /** Entries since the last take, to send as one batch. */
    take() {
      const out = pending;
      pending = [];
      return out;
    },
  };
}

/**
 * Caption blocks over time from a captions.jsonl log, ready to feed an utterance tracker.
 * Keys are objects (the tracker keeps them in a WeakMap), one per node id and logging session.
 * @returns {{ t: number, blocks: { key: object, speaker: string, text: string }[] }[]}
 */
export function replay(entries) {
  const out = [];
  let keys = new Map(), byId = new Map();
  for (const e of entries) {
    if (e.k === 'meta') { keys = new Map(); byId = new Map(); }
    if (e.k !== 'snap') continue;
    for (const b of e.set) byId.set(b.id, b);
    out.push({
      t: e.t,
      blocks: e.ids.map((id) => {
        if (!keys.has(id)) keys.set(id, { id });
        return { key: keys.get(id), speaker: byId.get(id).speaker, text: byId.get(id).text };
      }),
    });
  }
  return out;
}

/** Replaces each speaker name with "Speaker N", longest names first so "Ann Lee" is not split by "Ann". */
export function anonymize(html, names) {
  const unique = [...new Set(names.filter(Boolean))];
  const numbered = new Map(unique.map((n, i) => [n, `Speaker ${i + 1}`]));
  for (const n of [...unique].sort((a, b) => b.length - a.length)) html = html.split(n).join(numbered.get(n));
  return html;
}

const REGION_MAX = 300_000; // characters; the file goes through a data: URL, ~2 MB at most

/**
 * What the side panel's "Capture page" saves. Runs in the content script (needs a DOM).
 * The URL loses its query and hash: a Teams join link carries the meeting passcode there.
 * @param {{ doc: Document, site: string, region: Element | null, blocks: { speaker: string }[], found: object }} p
 */
export function capturePage({ doc, site, region, blocks, found }) {
  const names = blocks.map((b) => b.speaker);
  let regionHtml = '';
  if (region) {
    const copy = region.cloneNode(true);
    copy.querySelectorAll('script, style').forEach((el) => el.remove());
    for (const el of [copy, ...copy.querySelectorAll('*')]) {
      for (const a of [...el.attributes]) {
        // src: avatar URLs carry names; style: noise; on*: never run page code when the file is opened
        if (['src', 'srcset', 'style'].includes(a.name) || a.name.startsWith('on')) el.removeAttribute(a.name);
      }
    }
    regionHtml = anonymize(copy.outerHTML, names).slice(0, REGION_MAX);
  }
  const short = (el) => anonymize((el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40), names);
  const attrs = (el) => Object.fromEntries(['id', 'data-tid', 'jsname', 'role', 'aria-label', 'aria-pressed', 'type']
    .map((a) => [a, el.getAttribute(a)]).filter(([, v]) => v != null).map(([a, v]) => [a, anonymize(v, names)])); // "Pin Ann Lee"
  return {
    site,
    url: doc.location.origin + doc.location.pathname,
    lang: doc.documentElement.lang || '',
    at: new Date().toISOString(),
    found,
    blocks: blocks.length,
    controls: [...doc.querySelectorAll('button, [role="button"]')].map((el) => ({ tag: el.tagName.toLowerCase(), ...attrs(el), text: short(el) })),
    editors: [...doc.querySelectorAll('textarea, [contenteditable="true"]')].map((el) => ({ tag: el.tagName.toLowerCase(), ...attrs(el) })),
    regionHtml,
  };
}

/** One HTML file: the capture as JSON for tools, then the caption region as markup for fixtures and eyeballing. */
export function captureHtml(page) {
  const { regionHtml, ...info } = page;
  const json = JSON.stringify(info, null, 1).replace(/</g, '\\u003c'); // no "</script>" can end the block early
  return `<!doctype html>
<meta charset="utf-8">
<title>AfterCall capture ${page.site} ${page.at}</title>
<script type="application/json" id="aftercall-capture">
${json}
</script>
<!-- caption region (${page.found?.region ? 'found' : 'not found'}) -->
${regionHtml}
`;
}
