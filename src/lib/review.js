// review.html: one page in the recording's folder with the video next to the transcript and summary.
// Every [mm:ss] jumps the video there. It opens from disk (file://), so it sits beside recording.webm and needs no server.
import { fmt } from './clock.js';
import { header, talkShare } from './transcript.js';
import { labels } from './summary.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seconds = (mmss) => { const m = /^(\d+):(\d{2})$/.exec(String(mmss ?? '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const jump = (sec, label) => (sec == null ? esc(label) : `<a href="#" data-t="${sec}">${esc(label)}</a>`);

function summarySection(j) {
  const H = labels(j);
  const list = (a) => `<ul>${(a.length ? a : [H[6]]).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const actions = j.action_items.length
    ? `<table><tr>${H[7].split(' | ').map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${j.action_items.map((a) =>
      `<tr><td>${esc(a.task)}</td><td>${esc(a.owner)}</td><td>${esc(a.deadline)}</td><td>${jump(seconds(a.at), a.at)}</td></tr>`).join('')}</table>`
    : list([]);
  return `<section><h2>${esc(H[0])}</h2><p>${esc(j.brief)}</p>
    <h2>${esc(H[1])}</h2>${list(j.topics)}<h2>${esc(H[2])}</h2>${list(j.decisions)}
    <h2>${esc(H[3])}</h2>${actions}<h2>${esc(H[4])}</h2>${list(j.risks)}<h2>${esc(H[5])}</h2>${list(j.follow_up_questions)}</section>`;
}

/**
 * @param {{ meetCode: string, startedAt: number, durationMs: number, lines: object[], video?: string | null, summary?: object | null }} rec
 *   video: file name of the recording in the same folder; summary: the parsed summary JSON
 */
export function reviewHtml(rec) {
  const [title, meta] = header(rec).replace(/^# /, '').trim().split('\n');
  const talk = talkShare(rec.lines);
  const lines = [...rec.lines].sort((a, b) => a.t - b.t).map((l) => `<p>${jump(Math.floor(l.t / 1000), fmt(l.t))} ${l.mark
    ? `⭐ <b>${esc(l.text)}</b>` : `<b>${esc(l.speaker)}:</b> ${esc(l.text)}`}</p>`).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(meta)}</title>
<style>
body { margin: 0; font: 15px/1.6 -apple-system, "Sukhumvit Set", "Noto Sans Thai", "Segoe UI", system-ui, sans-serif; color: #1d2433; background: #f4f6f8; }
header { padding: 16px 24px 0; } h1 { margin: 0; font-size: 20px; } .meta { color: #6b7385; font-size: 13px; }
.grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 24px; padding: 16px 24px 48px; align-items: start; }
.player { position: sticky; top: 16px; } video { width: 100%; border-radius: 10px; background: #000; }
section { background: #fff; border-radius: 12px; padding: 4px 18px 12px; margin-bottom: 16px; }
h2 { font-size: 15px; margin: 16px 0 6px; } ul { margin: 0; padding-left: 20px; } .transcript p { margin: 6px 0; }
table { border-collapse: collapse; width: 100%; font-size: 14px; } th, td { text-align: left; padding: 6px 8px; border-top: 1px solid #e2e6eb; vertical-align: top; }
a[data-t] { color: #2b5fd9; font-variant-numeric: tabular-nums; text-decoration: none; } a[data-t]:hover { text-decoration: underline; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .player { position: static; } }
</style></head><body>
<header><h1>${esc(title)}</h1><div class="meta">${esc(meta)}${talk.length ? ` · ${talk.map((x) => `${esc(x.speaker)} ${Math.round(x.share * 100)}%`).join(' · ')}` : ''}</div></header>
<div class="grid">
<div class="player">${rec.video ? `<video controls preload="metadata" src="${esc(encodeURIComponent(rec.video))}"></video>` : ''}</div>
<div>${rec.summary ? summarySection(rec.summary) : ''}<section class="transcript"><h2>Transcript</h2>${lines}</section></div>
</div>
<script>
const v = document.querySelector('video');
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-t]');
  if (!a || !v) return;
  e.preventDefault();
  v.currentTime = Number(a.dataset.t);
  v.play();
});
</script>
</body></html>
`;
}
