import test from 'node:test';
import assert from 'node:assert/strict';
import { createUtteranceTracker } from '../src/lib/utterance.js';

function setup() {
  let t = 0;
  const out = [];
  const tr = createUtteranceTracker({ emit: (u) => out.push(u), idleMs: 1500, now: () => t });
  return { tr, out, at: (ms) => (t = ms) };
}

test('growing caption becomes one line, not one per edit', () => {
  const { tr, out, at } = setup();
  const a = {};
  at(0); tr.update([{ key: a, speaker: 'สมชาย', text: 'เริ่ม' }]);
  at(300); tr.update([{ key: a, speaker: 'สมชาย', text: 'เริ่มกันเลย' }]);
  at(600); tr.update([{ key: a, speaker: 'สมชาย', text: 'เริ่มกันเลยครับ' }]);
  at(1000); tr.tick();
  assert.equal(out.length, 0, 'still talking');
  at(2200); tr.tick();
  assert.deepEqual(out, [{ wall: 0, speaker: 'สมชาย', text: 'เริ่มกันเลยครับ' }]);
});

test('speech after an idle close only emits the new part, with a new start time', () => {
  const { tr, out, at } = setup();
  const a = {};
  at(0); tr.update([{ key: a, speaker: 'A', text: 'one' }]);
  at(2000); tr.tick();
  at(5000); tr.update([{ key: a, speaker: 'A', text: 'one two' }]);
  at(7000); tr.tick();
  assert.deepEqual(out.map((u) => [u.wall, u.text]), [[0, 'one'], [5000, 'two']]);
});

test('another speaker closes the previous speaker at once', () => {
  const { tr, out, at } = setup();
  const a = {}, b = {};
  at(0); tr.update([{ key: a, speaker: 'A', text: 'hello' }]);
  at(400); tr.update([{ key: a, speaker: 'A', text: 'hello' }, { key: b, speaker: 'B', text: 'hi' }]);
  assert.deepEqual(out, [{ wall: 0, speaker: 'A', text: 'hello' }]);
  // A's bubble keeps updating after being closed: only the new words come out
  at(600); tr.update([{ key: a, speaker: 'A', text: 'hello there' }, { key: b, speaker: 'B', text: 'hi' }]);
  tr.flush();
  assert.deepEqual(out.slice(1).map((u) => [u.speaker, u.text]).sort(), [['A', 'there'], ['B', 'hi']]);
});

test('removed block and flush close without duplicates', () => {
  const { tr, out, at } = setup();
  const a = {};
  at(0); tr.update([{ key: a, speaker: 'A', text: 'bye' }]);
  at(100); tr.update([]);
  tr.flush();
  assert.equal(out.length, 1);
});
