import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { errorKind, frame, handle, codexModels, claudeModels, claudeEfforts } from '../native/host.js';

test('errorKind maps CLI failures', () => {
  assert.equal(errorKind('spawn claude ENOENT'), 'nocli');
  assert.equal(errorKind('Not logged in · Please run /login'), 'auth');
  assert.equal(errorKind('unexpected status 401 Unauthorized'), 'auth');
  assert.equal(errorKind("You've hit your usage limit. Log in to another account"), 'limit');
  assert.equal(errorKind("There's an issue with the selected model (x). It may not exist or you may not have access to it."), 'model');
  assert.equal(errorKind('socket hang up'), 'retry');
});

test('frame is a little-endian length then JSON', () => {
  const b = frame({ a: 'ไทย' });
  assert.equal(b.readUInt32LE(0), b.length - 4);
  assert.deepEqual(JSON.parse(b.subarray(4)), { a: 'ไทย' });
});

test('handle rejects unknown providers without running anything', async () => {
  assert.equal((await handle({ type: 'summarize', provider: 'rm' })).ok, false);
  assert.equal((await handle({ type: 'summarize', provider: 'codex', effort: 'high" -c x="y' })).ok, false);
});

test('claudeModels reads the newest cached catalog and survives a missing one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aftercall-test-'));
  const catalog = (fetchedAt, models) => JSON.stringify({ fetchedAt, catalog: { config: { models } } });
  await writeFile(join(dir, 'old-cc.json'), catalog(1, [{ id: 'claude-old', name: 'Old 1' }]));
  await writeFile(join(dir, 'new-cc.json'), catalog(2, [
    { id: 'claude-opus-5-5', name: 'Opus 5.5', thinking: { effort_options: [{ id: 'low' }, { id: 'max' }] } },
    { id: 'claude-haiku-4-5', name: 'Haiku 4.5' },
  ]));
  assert.deepEqual(await claudeModels(dir), [
    { id: 'claude-opus-5-5', name: 'Opus 5.5', efforts: ['low', 'max'] },
    { id: 'claude-haiku-4-5', name: 'Haiku 4.5', efforts: [] },
  ]);
  assert.deepEqual(await claudeModels(join(dir, 'nope')), []);
});

test('claudeEfforts reads the levels from --help', () => {
  assert.deepEqual(claudeEfforts('  --effort <level>   Effort level for the current session\n      (low, medium, high, xhigh, max)\n  --model'), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(claudeEfforts('no such flag'), []);
});

test('codexModels keeps listed models and survives a missing cache', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'aftercall-test-')), 'models_cache.json');
  await writeFile(file, JSON.stringify({ models: [{ slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }] }, { slug: 'secret', visibility: 'hide' }] }));
  assert.deepEqual(await codexModels(file), [{ id: 'gpt-5.5', name: 'GPT-5.5', efforts: ['low', 'high'] }]);
  assert.deepEqual(await codexModels(join(tmpdir(), 'nope', 'x.json')), []);
});
