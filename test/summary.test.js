import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, parseSummary, summarize, summaryMarkdown, requestBody, listModels, estimateCost } from '../src/lib/summary.js';

const good = { brief: 'ประชุมวางแผน sprint', topics: ['login'], decisions: [], action_items: [{ task: 'รวม API', owner: 'ปิยะ', deadline: 'ไม่ระบุ', at: '00:52' }], risks: [], follow_up_questions: ['งบ cloud?'] };
const ok = (content, finish = 'stop') => ({ choices: [{ finish_reason: finish, message: { content } }] });

test('classify: status codes, errors inside 200, truncation, bad JSON', () => {
  assert.equal(classify(401, { error: { code: 401, message: 'User not found.' } }), 'auth');
  assert.equal(classify(402, { error: { code: 402 } }), 'credits');
  assert.equal(classify(503, { error: { code: 503, message: 'No endpoints found matching your data policy (provider)' } }), 'no-provider');
  assert.equal(classify(503, { error: { code: 503, message: 'upstream down' } }), 'retry');
  assert.equal(classify(429, {}), 'retry');
  assert.equal(classify(200, { error: { code: 502, message: 'provider error mid-response' } }), 'retry');
  assert.equal(classify(200, ok(JSON.stringify(good), 'length')), 'truncated');
  assert.equal(classify(200, ok('not json')), 'format');
  assert.equal(classify(200, ok(JSON.stringify(good))), null);
});

test('parseSummary accepts fenced JSON and rejects wrong shape', () => {
  assert.deepEqual(parseSummary('```json\n' + JSON.stringify(good) + '\n```'), good);
  assert.equal(parseSummary(JSON.stringify({ brief: 'x' })), null);
  assert.equal(parseSummary(undefined), null);
});

test('request asks for the schema and no data collection', () => {
  const b = requestBody('google/gemini-3.8-flash', 'T');
  assert.equal(b.response_format.json_schema.strict, true);
  assert.deepEqual(b.provider, { data_collection: 'deny' });
});

test('summarize maps a network failure and a success', async () => {
  const boom = async () => { throw new TypeError('Failed to fetch'); };
  assert.deepEqual(await summarize({ key: 'k', model: 'm', transcript: 't', fetch: boom }), { ok: false, kind: 'retry', message: 'Failed to fetch' });
  const fine = async () => ({ status: 200, json: async () => ok(JSON.stringify(good)) });
  assert.deepEqual(await summarize({ key: 'k', model: 'm', transcript: 't', fetch: fine }), { ok: true, summary: good });
});

test('summary markdown follows the summary language and escapes tables', () => {
  const md = summaryMarkdown({ ...good, action_items: [{ task: 'a|b', owner: 'ปิยะ', deadline: 'ไม่ระบุ', at: '00:52' }] });
  assert.match(md, /## สรุปสั้น/);
  assert.match(md, /\| a\\\|b \| ปิยะ \| ไม่ระบุ \| 00:52 \|/);
  assert.match(md, /## การตัดสินใจ\n\n- ไม่มี/);
  assert.match(summaryMarkdown({ ...good, brief: 'Sprint planning' }), /## Summary/);
});

test('model list keeps text models with structured outputs, drops :batch', async () => {
  const data = [
    { id: 'google/gemini-3.8-flash', architecture: { output_modalities: ['text'] }, supported_parameters: ['structured_outputs'], pricing: { prompt: '0.00000075', completion: '0.00000375' } },
    { id: 'google/gemini-3.8-flash:batch', architecture: { output_modalities: ['text'] }, supported_parameters: ['structured_outputs'] },
    { id: 'google/gemini-3.1-flash-image', architecture: { output_modalities: ['image', 'text'] }, supported_parameters: ['structured_outputs'] },
    { id: 'x/no-schema', architecture: { output_modalities: ['text'] }, supported_parameters: [] },
  ];
  assert.deepEqual(await listModels(async () => ({ json: async () => ({ data }) })), [{ id: 'google/gemini-3.8-flash', pricing: data[0].pricing }]);
});

test('cost estimate scales with transcript and is null without a price', () => {
  const pricing = { prompt: '0.00000075', completion: '0.00000375' };
  const hour = 'x'.repeat(75_000); // ~30k tokens, a one-hour Thai meeting
  const usd = estimateCost(hour, pricing);
  assert.ok(usd > 0.02 && usd < 0.04, `got ${usd}`);
  assert.ok(estimateCost('', pricing) < usd);
  assert.equal(estimateCost(hour, undefined), null);
  assert.equal(estimateCost(hour, { prompt: '0', completion: '0' }), 0);
});
