import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptionLog, replay, anonymize, captureHtml } from '../src/lib/debug.js';
import { createUtteranceTracker } from '../src/lib/utterance.js';

function setup(opts = {}) {
  let t = 0;
  const log = createCaptionLog({ meta: { site: 'teams' }, now: () => t, ...opts });
  return { log, at: (ms) => (t = ms) };
}

test('snaps hold only new or changed blocks, and skip repeats', () => {
  const { log, at } = setup();
  const a = {}, b = {};
  at(0); log.snapshot([{ key: a, speaker: 'A', text: 'hi' }]);
  at(200); log.snapshot([{ key: a, speaker: 'A', text: 'hi' }]); // nothing changed
  at(400); log.snapshot([{ key: a, speaker: 'A', text: 'hi' }, { key: b, speaker: 'B', text: 'yo' }]);
  at(600); log.snapshot([{ key: b, speaker: 'B', text: 'yo' }]); // a scrolled away
  assert.deepEqual(log.take().map(({ k, ids, set }) => [k, ids, set]), [
    ['meta', undefined, undefined],
    ['snap', [1], [{ id: 1, speaker: 'A', text: 'hi' }]],
    ['snap', [1, 2], [{ id: 2, speaker: 'B', text: 'yo' }]],
    ['snap', [2], []],
  ]);
  assert.deepEqual(log.take(), [], 'take empties the batch');
});

test('snaps closer than minGapMs are skipped until called again', () => {
  const { log, at } = setup();
  const a = {};
  at(0); log.snapshot([{ key: a, speaker: 'A', text: 'h' }]);
  at(50); log.snapshot([{ key: a, speaker: 'A', text: 'he' }]);
  at(250); log.snapshot([{ key: a, speaker: 'A', text: 'hey' }]); // the timer call picks up the latest text
  assert.deepEqual(log.take().filter((e) => e.k === 'snap').map((e) => e.set[0].text), ['h', 'hey']);
});

test('logging stops snapping at max and says so', () => {
  const { log, at } = setup({ max: 2 });
  for (let i = 0; i < 5; i++) { at(i * 1000); log.snapshot([{ key: {}, speaker: 'A', text: `${i}` }]); }
  log.emit({ wall: 0, speaker: 'A', text: 'x' }, 'flush');
  assert.deepEqual(log.take().slice(1).map((e) => e.k + (e.state ?? '')), ['snap', 'snap', 'statetruncated', 'emit']);
});

test('replay rebuilds the blocks and gives the tracker the same result as the live page', () => {
  const live = [], replayed = [];
  let t = 0;
  const now = () => t;
  const liveTracker = createUtteranceTracker({ emit: (u) => live.push(u), now });
  const log = createCaptionLog({ meta: {}, now });
  const a = {}, b = {};
  const frames = [
    [0, [{ key: a, speaker: 'A', text: 'สวัสดี' }]],
    [300, [{ key: a, speaker: 'A', text: 'สวัสดีครับ' }]],
    [600, [{ key: a, speaker: 'A', text: 'สวัสดีครับ' }, { key: b, speaker: 'B', text: 'hello' }]],
    [900, [{ key: b, speaker: 'B', text: 'hello there' }]],
  ];
  for (const [ms, blocks] of frames) { t = ms; log.snapshot(blocks); liveTracker.update(blocks); }
  liveTracker.flush();

  const tracker = createUtteranceTracker({ emit: (u) => replayed.push(u), now });
  for (const f of replay(log.take())) { t = f.t; tracker.update(f.blocks); }
  tracker.flush();
  assert.deepEqual(replayed, live);
  assert.equal(live.length, 2);
});

test('replay starts fresh ids after a tab reload (a new meta line)', () => {
  const entries = [
    { k: 'meta', t: 0 },
    { k: 'snap', t: 1, ids: [1], set: [{ id: 1, speaker: 'A', text: 'one' }] },
    { k: 'meta', t: 2 },
    { k: 'snap', t: 3, ids: [1], set: [{ id: 1, speaker: 'B', text: 'two' }] },
  ];
  const [first, second] = replay(entries);
  assert.notEqual(first.blocks[0].key, second.blocks[0].key);
  assert.equal(second.blocks[0].speaker, 'B');
});

test('anonymize numbers speakers and replaces longer names first', () => {
  assert.equal(anonymize('<b>Ann Lee</b> <b>Ann</b> <i>Ann Lee</i>', ['Ann', 'Ann Lee', 'Ann']), '<b>Speaker 2</b> <b>Speaker 1</b> <i>Speaker 2</i>');
});

test('captureHtml keeps the JSON block closed even if the page contains </script>', () => {
  const html = captureHtml({ site: 'meet', at: 'now', found: { region: true }, controls: [{ text: '</script><b>x' }], regionHtml: '<div>caption</div>' });
  const json = html.match(/<script type="application\/json" id="aftercall-capture">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(json).controls[0].text, '</script><b>x');
  assert.match(html, /<div>caption<\/div>/);
});
