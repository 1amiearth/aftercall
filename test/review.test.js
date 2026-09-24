import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewHtml } from '../src/lib/review.js';

const rec = {
  meetCode: 'abc-defg-hij', startedAt: new Date(2026, 8, 24, 14, 5).getTime(), durationMs: 120_000,
  lines: [{ t: 65_500, speaker: '<img src=x onerror=alert(1)>', text: 'a & b' }, { t: 5_000, mark: true, speaker: '', text: 'สำคัญ' }],
};
const summary = { brief: 'Sprint planning', topics: [], decisions: [], risks: [], follow_up_questions: [],
  action_items: [{ task: 'Ship', owner: 'Ann', deadline: 'Fri', at: '01:05' }, { task: 'Ask', owner: 'Bo', deadline: 'x', at: 'soon' }],
  extra_sections: [{ title: 'Next meeting', items: ['Thu 10:00'] }] };

test('transcript lines jump to their second, in time order, escaped', () => {
  const html = reviewHtml({ ...rec, video: 'recording (1).webm' });
  assert.match(html, /<video controls preload="metadata" src="recording%20\(1\)\.webm">/);
  assert.ok(html.indexOf('data-t="5"') < html.indexOf('data-t="65"'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /a &amp; b/);
});

test('summary action items link only valid timestamps; no video, no player', () => {
  const html = reviewHtml({ ...rec, summary });
  assert.match(html, /<td><a href="#" data-t="65">01:05<\/a><\/td>/);
  assert.match(html, /<td>soon<\/td>/);
  assert.match(html, /<h2>Action items<\/h2>/);
  assert.match(html, /<\/table><h2>Next meeting<\/h2><ul><li>Thu 10:00<\/li><\/ul><h2>Risks/);
  assert.doesNotMatch(html, /<video/);
});
