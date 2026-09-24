import { fmt } from './clock.js';

// ponytail: "You"/"คุณ" is what Meet is assumed to show for your own captions; confirm with ticket 02 export.
const SELF_LABEL = /^(you|คุณ)$/i;

/** Meet room code from a tab URL, or null. @param {string | undefined} url */
export function meetCodeFromUrl(url) {
  return url?.match(/^https:\/\/meet\.google\.com\/([a-z]{3,4}-[a-z]{4}-[a-z]{3,4})(?:[/?#]|$)/)?.[1] ?? null;
}

/** Replace Meet's label for yourself with the recorder's name. */
export const speakerName = (speaker, selfName) =>
  selfName && SELF_LABEL.test(speaker.trim()) ? selfName : speaker;

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Downloads subfolder for one recording, e.g. "AfterCall/2026-09-24_1430_abc-defg-hij". */
export const folderName = (date, meetCode) =>
  `AfterCall/${localDate(date)}_${localTime(date).replace(':', '')}_${meetCode}`;

/** Header shared by transcript.md and summary.md. */
export const header = ({ meetCode, startedAt, durationMs }) => {
  const d = new Date(startedAt);
  return `# Meet ${meetCode}\n${localDate(d)} ${localTime(d)} · ${fmt(durationMs)}\n`;
};

/**
 * @param {{ meetCode: string, startedAt: number, durationMs: number, lines: { t: number, speaker: string, text: string }[] }} rec
 */
export const transcriptMarkdown = (rec) =>
  `${header(rec)}\n${[...rec.lines].sort((a, b) => a.t - b.t).map(line).join('\n')}\n`;

/** A caption line, or a ⭐ mark the recorder added. */
const line = (l) => (l.mark ? `[${fmt(l.t)}] ⭐ **${l.text}**` : `[${fmt(l.t)}] **${l.speaker}:** ${l.text}`);
