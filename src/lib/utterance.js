// Turns Meet's live-edited caption blocks into finished utterances.
// A block is one speaker's caption bubble; Meet keeps rewriting its text while they talk.
// An utterance closes when another speaker starts, the block disappears, or its text stops changing for idleMs.

/**
 * @typedef {{ key: object, speaker: string, text: string }} Block   key = the DOM node (identity only)
 * @typedef {{ wall: number, speaker: string, text: string }} Utterance  wall = when the utterance started
 */

/**
 * @param {{ emit: (u: Utterance) => void, idleMs?: number, now?: () => number }} opts
 */
export function createUtteranceTracker({ emit, idleMs = 1500, now = Date.now }) {
  const open = new Map(); // key -> { speaker, text, done, startedAt, last }
  const emitted = new WeakMap(); // key -> text already emitted, survives the block being reopened

  function close(key, u) {
    // ponytail: if Meet rewrites text that was already emitted, we emit the whole new text (may duplicate a few words).
    const piece = (u.text.startsWith(u.done) ? u.text.slice(u.done.length) : u.text).trim();
    if (piece) emit({ wall: u.startedAt, speaker: u.speaker, text: piece });
    u.done = u.text;
    emitted.set(key, u.text);
  }

  return {
    /** @param {Block[]} blocks current caption blocks, oldest first */
    update(blocks) {
      const seen = new Set();
      for (const b of blocks) {
        seen.add(b.key);
        let u = open.get(b.key);
        if (!u) {
          const done = emitted.get(b.key) ?? '';
          u = { speaker: b.speaker, text: done, done, startedAt: now(), last: now() };
          open.set(b.key, u);
          for (const [k, o] of open) {
            if (k !== b.key && o.speaker !== b.speaker) { close(k, o); open.delete(k); }
          }
        }
        if (b.text !== u.text) {
          if (u.text === u.done) u.startedAt = now();
          u.text = b.text;
          u.last = now();
        }
      }
      for (const [k, u] of open) if (!seen.has(k)) { close(k, u); open.delete(k); }
    },
    /** Call every ~250 ms. */
    tick() {
      for (const [k, u] of open) if (u.text !== u.done && now() - u.last >= idleMs) close(k, u);
    },
    /** Close everything, e.g. on pause or stop. */
    flush() {
      for (const [k, u] of open) close(k, u);
      open.clear();
    },
  };
}
