import { fmt } from './clock.js';

// ponytail: "You"/"คุณ" is what Meet is assumed to show for your own captions; confirm with ticket 02 export.
const SELF_LABEL = /^(you|คุณ)$/i;

export const isTeamsUrl = (url) => /^https:\/\/teams\.(microsoft|live)\.com\//.test(url ?? '');

/**
 * Meeting code from a tab URL, or null: a Meet room code ("abc-defg-hij") or "teams-" plus the Teams meeting ID.
 * @param {string | undefined} url
 */
export function meetCodeFromUrl(url) {
  const meet = url?.match(/^https:\/\/meet\.google\.com\/([a-z]{3,4}-[a-z]{4}-[a-z]{3,4})(?:[/?#]|$)/)?.[1];
  if (meet) return meet;
  if (!isTeamsUrl(url)) return null;
  // The browser join page (light-meetings/launch) carries the meeting as base64 JSON in ?coords=.
  let code = null;
  try { code = JSON.parse(atob(new URL(url).searchParams.get('coords'))).meetingCode; } catch {}
  // Otherwise a /meet/<id> link (Teams free: /v2/meet/meet-now, no ID), or a meetup-join link: its thread ID is long, the first 12 characters tell meetings apart.
  code = /^\d+$/.test(code) ? code : url.match(/\/meet\/([\w-]+)/)?.[1] ?? url.match(/19(?::|%3A)meeting_([A-Za-z0-9]{12})/i)?.[1];
  return code ? `teams-${code}` : null;
}

/** "Meet abc-defg-hij" or "Teams 439031496660244". */
export const meetingTitle = (code) => (code.startsWith('teams-') ? `Teams ${code.slice(6)}` : `Meet ${code}`);

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
export const header = (rec) => `# ${meetingTitle(rec.meetCode)}\n${when(rec)}\n`;

/** "2026-09-24 14:30 · 52:10": start and length of a recording. */
export const when = ({ startedAt, durationMs }) => {
  const d = new Date(startedAt);
  return `${localDate(d)} ${localTime(d)} · ${fmt(durationMs)}`;
};

/**
 * Each speaker's share of what was said, largest first. ⭐ marks do not count.
 * ponytail: shares by characters, not seconds, because utterances only carry a start time; add an end time in utterance.js if this misleads.
 * @returns {{ speaker: string, share: number, turns: number }[]}
 */
export function talkShare(lines) {
  const by = new Map();
  for (const l of lines) {
    if (l.mark) continue;
    const x = by.get(l.speaker) ?? { speaker: l.speaker, chars: 0, turns: 0 };
    x.chars += l.text.length;
    x.turns++;
    by.set(l.speaker, x);
  }
  const total = [...by.values()].reduce((n, x) => n + x.chars, 0);
  return [...by.values()].map(({ speaker, chars, turns }) => ({ speaker, share: total ? chars / total : 0, turns })).sort((a, b) => b.share - a.share);
}

const pct = (share) => `${Math.round(share * 100)}%`;

/**
 * @param {{ meetCode: string, startedAt: number, durationMs: number, lines: { t: number, speaker: string, text: string }[] }} rec
 */
export function transcriptMarkdown(rec) {
  const talk = talkShare(rec.lines);
  const speakers = talk.length ? `Speakers: ${talk.map((x) => `${x.speaker} ${pct(x.share)}`).join(' · ')}\n` : '';
  return `${header(rec)}${speakers}\n${[...rec.lines].sort((a, b) => a.t - b.t).map(line).join('\n')}\n`;
}

/** A caption line, or a ⭐ mark the recorder added. */
const line = (l) => (l.mark ? `[${fmt(l.t)}] ⭐ **${l.text}**` : `[${fmt(l.t)}] **${l.speaker}:** ${l.text}`);
