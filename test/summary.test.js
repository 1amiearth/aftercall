import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary, summarize, summaryMarkdown, ping, SCHEMA } from '../src/lib/summary.js';

const good = { brief: 'ประชุมวางแผน sprint', topics: ['login'], decisions: [], action_items: [{ task: 'รวม API', owner: 'ปิยะ', deadline: 'ไม่ระบุ', at: '00:52' }], risks: [], follow_up_questions: ['งบ cloud?'] };

test('parseSummary accepts fenced JSON and rejects wrong shape', () => {
  assert.deepEqual(parseSummary('```json\n' + JSON.stringify(good) + '\n```'), good);
  assert.equal(parseSummary(JSON.stringify({ brief: 'x' })), null);
  assert.equal(parseSummary(undefined), null);
});

test('summarize sends the schema to the host and maps its replies', async () => {
  let sent;
  const reply = (r) => async (msg) => { sent = msg; return r; };
  assert.deepEqual(await summarize({ provider: 'claude', model: 'opus', effort: 'high', transcript: 't', send: reply({ ok: true, content: JSON.stringify(good) }) }), { ok: true, summary: good });
  assert.equal(sent.provider, 'claude');
  assert.equal(sent.model, 'opus');
  assert.equal(sent.effort, 'high');
  assert.equal(sent.schema, SCHEMA);
  assert.match(sent.prompt, /Transcript:\n\nt$/);
  assert.deepEqual(await summarize({ provider: 'codex', transcript: 't', send: reply({ ok: false, kind: 'auth', message: 'Not logged in' }) }), { ok: false, kind: 'auth', message: 'Not logged in' });
  assert.equal((await summarize({ provider: 'claude', transcript: 't', send: reply({ ok: true, content: 'not json' }) })).kind, 'format');
  const missing = async () => { throw new Error('Specified native messaging host not found.'); };
  assert.equal((await summarize({ provider: 'claude', transcript: 't', send: missing })).kind, 'nohost');
});

test('ping is null without the host', async () => {
  assert.deepEqual(await ping(async () => { throw new Error('not found'); }), { error: 'not found' });
  const clis = { claude: '2.1', codex: null }, models = { claude: [{ id: 'sonnet', name: 'Sonnet' }], codex: [] };
  assert.deepEqual(await ping(async () => ({ ok: true, clis, models })), { clis, models });
});

test('summary markdown follows the summary language and escapes tables', () => {
  const md = summaryMarkdown({ ...good, action_items: [{ task: 'a|b', owner: 'ปิยะ', deadline: 'ไม่ระบุ', at: '00:52' }] });
  assert.match(md, /## สรุปสั้น/);
  assert.match(md, /\| a\\\|b \| ปิยะ \| ไม่ระบุ \| 00:52 \|/);
  assert.match(md, /## การตัดสินใจ\n\n- ไม่มี/);
  assert.match(summaryMarkdown({ ...good, brief: 'Sprint planning' }), /## Summary/);
});
