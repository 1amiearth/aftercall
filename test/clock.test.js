import test from 'node:test';
import assert from 'node:assert/strict';
import { startClock, pauseClock, resumeClock, videoMs, isPaused, fmt } from '../src/lib/clock.js';

test('video time skips pauses, including ones after the moment asked about', () => {
  let c = startClock(1000);
  c = pauseClock(c, 11000); // paused 10s..20s of wall time
  c = resumeClock(c, 21000);
  assert.equal(videoMs(c, 6000), 5000, 'before the pause');
  assert.equal(videoMs(c, 16000), 10000, 'during the pause freezes');
  assert.equal(videoMs(c, 31000), 20000, 'after the pause subtracts it');
});

test('open pause freezes time and pause/resume are idempotent', () => {
  let c = pauseClock(pauseClock(startClock(0), 5000), 7000);
  assert.ok(isPaused(c));
  assert.equal(c.pauses.length, 1);
  assert.equal(videoMs(c, 60000), 5000);
  c = resumeClock(resumeClock(c, 8000), 9000);
  assert.equal(c.pauses[0].to, 8000);
});

test('fmt keeps counting minutes past an hour', () => {
  assert.equal(fmt(0), '00:00');
  assert.equal(fmt(65_900), '01:05');
  assert.equal(fmt(3_725_000), '62:05');
});
