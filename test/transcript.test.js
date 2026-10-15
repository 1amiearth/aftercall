import test from 'node:test';
import assert from 'node:assert/strict';
import { meetCodeFromUrl, sameMeeting, speakerName, folderName, transcriptMarkdown, talkShare } from '../src/lib/transcript.js';

test('talk share by text, marks ignored, largest first', () => {
  const share = talkShare([
    { t: 0, speaker: 'A', text: 'x' },
    { t: 1, speaker: 'B', text: 'xxx' },
    { t: 2, mark: true, speaker: '', text: 'ปักหมุดว่าสำคัญยาวมากๆ' },
    { t: 3, speaker: 'A', text: 'x' },
  ]);
  assert.deepEqual(share, [{ speaker: 'B', share: 0.6, turns: 1 }, { speaker: 'A', share: 0.4, turns: 2 }]);
  assert.deepEqual(talkShare([]), []);
});

test('same meeting: Meet by code, Teams also across URLs without an ID', () => {
  assert.equal(sameMeeting('abc-defg-hij', 'abc-defg-hij'), true);
  assert.equal(sameMeeting('abc-defg-hij', 'xyz-defg-hij'), false);
  assert.equal(sameMeeting('abc-defg-hij', null), false);
  assert.equal(sameMeeting('teams-439031496660244', 'teams-meeting'), true); // URL rewritten mid-call
  assert.equal(sameMeeting('teams-meet-now', 'teams-9312345678901'), true);
  assert.equal(sameMeeting('teams-439031496660244', 'teams-9312345678901'), false); // another meeting
  assert.equal(sameMeeting('teams-meeting', 'abc-defg-hij'), false);
  assert.equal(sameMeeting('teams-meeting', null), false); // left Teams
});

test('meet code from URL', () => {
  assert.equal(meetCodeFromUrl('https://meet.google.com/abc-defg-hij'), 'abc-defg-hij');
  assert.equal(meetCodeFromUrl('https://meet.google.com/abc-defg-hij?authuser=1'), 'abc-defg-hij');
  assert.equal(meetCodeFromUrl('https://meet.google.com/landing'), null);
  assert.equal(meetCodeFromUrl('https://evil.com/https://meet.google.com/abc-defg-hij'), null);
  assert.equal(meetCodeFromUrl(undefined), null);
});

test('meetCodeFromUrl reads Teams meeting IDs', () => {
  const coords = encodeURIComponent(btoa(JSON.stringify({ meetingUrl: 'https://teams.microsoft.com/meet/439031496660244?p=x', meetingCode: '439031496660244' })));
  assert.equal(meetCodeFromUrl(`https://teams.microsoft.com/light-meetings/launch?p=x&anon=true&coords=${coords}`), 'teams-439031496660244');
  assert.equal(meetCodeFromUrl('https://teams.microsoft.com/meet/439031496660244?p=x'), 'teams-439031496660244');
  assert.equal(meetCodeFromUrl('https://teams.microsoft.com/l/meetup-join/19%3ameeting_MjA4NzE2YTktYjQ4@thread.v2/0'), 'teams-MjA4NzE2YTkt');
  assert.equal(meetCodeFromUrl('https://teams.microsoft.com/v2/'), 'teams-meeting');
  assert.equal(meetCodeFromUrl('https://teams.live.com/v2/meet/meet-now'), 'teams-meet-now');
  assert.equal(meetCodeFromUrl('https://teams.live.com/meet/9312345678901?p=x'), 'teams-9312345678901');
  assert.equal(meetCodeFromUrl('https://teams.cloud.microsoft/meet/439031496660244?p=x'), 'teams-439031496660244');
  assert.equal(meetCodeFromUrl('https://evil.com/?u=https://teams.microsoft.com/meet/123'), null);
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
  assert.equal(md, '# Meet abc-defg-hij\n2026-09-24 14:05 · 52:10\nSpeakers: สมชาย 100%\n\n[00:12] **สมชาย:** เริ่มกันเลยครับ\n');
  const marked = transcriptMarkdown({ meetCode: 'a', startedAt: d.getTime(), durationMs: 0,
    lines: [{ t: 30_000, speaker: 'B', text: 'later' }, { t: 5_000, mark: true, text: 'ช่วงสำคัญ' }] });
  assert.match(marked, /\[00:05\] ⭐ \*\*ช่วงสำคัญ\*\*\n\[00:30\] \*\*B:\*\* later/);
});
