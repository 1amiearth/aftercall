// Video clock: maps wall-clock time to time inside the recording, skipping pauses.

/** @typedef {{ start: number, pauses: { from: number, to: number | null }[] }} Clock */

/** @param {number} now @returns {Clock} */
export const startClock = (now) => ({ start: now, pauses: [] });

/** @param {Clock} c @param {number} now @returns {Clock} */
export const pauseClock = (c, now) =>
  isPaused(c) ? c : { ...c, pauses: [...c.pauses, { from: now, to: null }] };

/** @param {Clock} c @param {number} now @returns {Clock} */
export const resumeClock = (c, now) =>
  isPaused(c) ? { ...c, pauses: c.pauses.map((p) => (p.to === null ? { ...p, to: now } : p)) } : c;

/** @param {Clock} c */
export const isPaused = (c) => c.pauses.some((p) => p.to === null);

/**
 * Milliseconds into the video at wall-clock time `wall`.
 * @param {Clock} c @param {number} wall
 */
export function videoMs(c, wall) {
  let ms = wall - c.start;
  for (const p of c.pauses) {
    if (p.from >= wall) continue;
    ms -= Math.min(wall, p.to ?? wall) - p.from;
  }
  return Math.max(0, ms);
}

/** "mm:ss", minutes keep counting past 59. @param {number} ms */
export function fmt(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
