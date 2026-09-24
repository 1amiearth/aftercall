import test from 'node:test';
import assert from 'node:assert/strict';
import { captionHealth, speech } from '../src/lib/health.js';

test('caption health: off wins, then unreadable, then quiet', () => {
  assert.equal(captionHealth({ cc: false, unreadablePolls: 9, quietMs: 1e9 }), 'off');
  assert.equal(captionHealth({ cc: true, unreadablePolls: 3, quietMs: 0 }), 'unreadable');
  assert.equal(captionHealth({ cc: true, unreadablePolls: 2, quietMs: 119_999 }), 'ok');
  assert.equal(captionHealth({ cc: true, unreadablePolls: 0, quietMs: 120_000 }), 'quiet');
});

test('speech drops marks', () => {
  assert.deepEqual(speech([{ t: 1, text: 'a' }, { t: 2, mark: true, text: '⭐' }]), [{ t: 1, text: 'a' }]);
});
