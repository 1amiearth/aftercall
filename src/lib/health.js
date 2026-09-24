// Is AfterCall actually getting captions? The side panel checks this while recording,
// so a broken Meet page shows up during the meeting, not after it.

export const QUIET_MS = 120_000;
export const UNREADABLE_POLLS = 3; // ~6 s of captions on screen that we cannot parse

/**
 * @param {{ cc: boolean, unreadablePolls: number, quietMs: number }} p
 *   unreadablePolls: consecutive status polls where captions were on screen but no bubble parsed
 *   quietMs: video time since the last caption line (or since the start)
 * @returns {'off' | 'unreadable' | 'quiet' | 'ok'}
 */
export function captionHealth({ cc, unreadablePolls, quietMs }) {
  if (!cc) return 'off';
  if (unreadablePolls >= UNREADABLE_POLLS) return 'unreadable';
  if (quietMs >= QUIET_MS) return 'quiet';
  return 'ok';
}

/** Caption lines only, without the recorder's ⭐ marks. */
export const speech = (lines) => lines.filter((l) => !l.mark);
