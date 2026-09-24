import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSummary, summarize, summaryMarkdown, slackMessage, ping, SCHEMA, SYSTEM } from '../src/lib/summary.js';

const good = { brief: 'ประชุมวางแผน sprint', topics: ['login'], decisions: [], action_items: [{ task: 'รวม API', owner: 'ปิยะ', deadline: 'ไม่ระบุ', at: '00:52' }], risks: [], follow_up_questions: ['งบ cloud?'], extra_sections: [] };
const nextMeeting = { title: 'นัดครั้งถัดไป', items: ['พฤหัส 2 ต.ค. 10:00 demo ให้ลูกค้า'] };

test('extra sections come after action items everywhere; old summaries without them still work', () => {
  const j = { ...good, extra_sections: [nextMeeting, { title: 'ว่าง', items: [] }] };
  assert.match(summaryMarkdown(j), /\| 00:52 \|\n\n## นัดครั้งถัดไป\n\n- พฤหัส 2 ต.ค. 10:00 demo ให้ลูกค้า\n\n## ความเสี่ยง/);
  assert.doesNotMatch(summaryMarkdown(j), /## ว่าง/);
  assert.match(slackMessage(j, 'x').text, /\*ใครทำอะไร\*\n.*\n\n\*นัดครั้งถัดไป\*\n• พฤหัส 2 ต.ค. 10:00 demo ให้ลูกค้า\n\n\*ต้องตามต่อ\*/);
  const { extra_sections, ...old } = good;
  assert.deepEqual(parseSummary(JSON.stringify(old)).extra_sections, []);
  assert.doesNotThrow(() => summaryMarkdown(old));
});

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

test('recorder notes go after the rules, blank notes change nothing', async () => {
  let sent;
  const send = async (msg) => { sent = msg; return { ok: true, content: JSON.stringify(good) }; };
  await summarize({ provider: 'claude', transcript: 't', notes: '  \n', send });
  assert.equal(sent.system, SYSTEM);
  await summarize({ provider: 'claude', transcript: 't', notes: ' focus on budget ', send });
  assert.ok(sent.system.startsWith(SYSTEM));
  assert.match(sent.system, /rules above:\nfocus on budget$/);
});

test('slack post keeps the outcome, skips empty sections and unstated deadlines', () => {
  const { text, html } = slackMessage({ ...good, risks: ['<ยังไม่มี staging>'],
    action_items: [...good.action_items, { task: 'Deploy', owner: 'ไม่ระบุ', deadline: 'วันศุกร์', at: '01:10' }] }, '2026-09-24 14:30 · 52:10');
  assert.equal(text, [
    '*สรุปประชุม · 2026-09-24 14:30 · 52:10*\nประชุมวางแผน sprint',
    '*ใครทำอะไร*\n• *ปิยะ* รวม API\n• *ยังไม่มีคนรับ* Deploy (ภายใน วันศุกร์)',
    '*ต้องตามต่อ*\n• <ยังไม่มี staging>\n• งบ cloud?',
  ].join('\n\n'));
  assert.doesNotMatch(text, /ตัดสินใจ|login|00:52/); // no decisions, no topics, no timestamps
  assert.match(html, /<li><b>ปิยะ<\/b> รวม API<\/li>/);
  assert.match(html, /&lt;ยังไม่มี staging&gt;/);
  assert.match(slackMessage({ ...good, brief: 'Sprint planning' }, 'x').text, /^\*Meeting notes · x\*/);
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
