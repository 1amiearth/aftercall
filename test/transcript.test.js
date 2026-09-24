import test from 'node:test';
import assert from 'node:assert/strict';
import { meetCodeFromUrl, speakerName, folderName, transcriptMarkdown } from '../src/lib/transcript.js';

test('meet code from URL', () => {
  assert.equal(meetCodeFromUrl('https://meet.google.com/abc-defg-hij'), 'abc-defg-hij');
  assert.equal(meetCodeFromUrl('https://meet.google.com/abc-defg-hij?authuser=1'), 'abc-defg-hij');
  assert.equal(meetCodeFromUrl('https://meet.google.com/landing'), null);
  assert.equal(meetCodeFromUrl('https://evil.com/https://meet.google.com/abc-defg-hij'), null);
  assert.equal(meetCodeFromUrl(undefined), null);
});

test('own caption label becomes the recorder name only when set', () => {
  assert.equal(speakerName('You', 'Earth'), 'Earth');
  assert.equal(speakerName('คุณ', 'Earth'), 'Earth');
  assert.equal(speakerName('You', ''), 'You');
  assert.equal(speakerName('Youna', 'Earth'), 'Youna');
});

test('folder and transcript format', () => {
  const d = new Date(2026, 8, 24, 14, 5);
  assert.equal(folderName(d, 'abc-defg-hij'), 'AfterCall/2026-09-24_1405_abc-defg-hij');
  const md = transcriptMarkdown({
    meetCode: 'abc-defg-hij', startedAt: d.getTime(), durationMs: 3_130_000,
    lines: [{ t: 12_000, speaker: 'สมชาย', text: 'เริ่มกันเลยครับ' }],
  });
  assert.equal(md, '# Meet abc-defg-hij\n2026-09-24 14:05 · 52:10\n\n[00:12] **สมชาย:** เริ่มกันเลยครับ\n');
  const marked = transcriptMarkdown({ meetCode: 'a', startedAt: d.getTime(), durationMs: 0,
    lines: [{ t: 30_000, speaker: 'B', text: 'later' }, { t: 5_000, mark: true, text: 'ช่วงสำคัญ' }] });
  assert.match(marked, /\[00:05\] ⭐ \*\*ช่วงสำคัญ\*\*\n\[00:30\] \*\*B:\*\* later/);
});
