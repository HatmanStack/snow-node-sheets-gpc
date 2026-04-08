'use strict';

require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const ITEM = { TS: '2024-01-01', NAME: 'Alice', DAYS: '1', DIET: '', PAY: '' };

function freshGateway() {
  delete require.cache[require.resolve('../src/gateway.js')];
  return require('../src/gateway');
}

test('submitItem sends Idempotency-Key and item body', async () => {
  /** @type {Array<{ url: string, init: any }>} */
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const { submitItem } = freshGateway();
  const out = await submitItem(ITEM);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'POST');
  assert.ok(calls[0].init.headers['Idempotency-Key']);
  assert.equal(out.idempotencyKey, calls[0].init.headers['Idempotency-Key']);
  assert.equal(JSON.parse(calls[0].init.body).NAME, 'Alice');
});

test('submitItem throws 502 on upstream failure (after retries)', async () => {
  let n = 0;
  global.fetch = async () => {
    n++;
    return new Response('boom', { status: 503 });
  };
  const { submitItem } = freshGateway();
  await assert.rejects(submitItem(ITEM), /upstream_submit_failed/);
  // initial + 2 retries = 3
  assert.equal(n, 3);
});

test('submitItem succeeds on first 2xx without retry', async () => {
  let n = 0;
  global.fetch = async () => {
    n++;
    return new Response('{}', { status: 200 });
  };
  const { submitItem } = freshGateway();
  await submitItem(ITEM);
  assert.equal(n, 1);
});

test('fetchJson aborts after timeout', async () => {
  process.env.FETCH_TIMEOUT_MS = '20';
  process.env.FETCH_MAX_RETRIES = '0';
  delete require.cache[require.resolve('../src/config.js')];
  delete require.cache[require.resolve('../src/sheets.js')];
  global.fetch = (_url, init) =>
    new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(new Error('aborted')));
    });
  const { submitItem } = freshGateway();
  await assert.rejects(submitItem(ITEM), /aborted/);
  // restore for downstream tests
  process.env.FETCH_TIMEOUT_MS = '50';
  process.env.FETCH_MAX_RETRIES = '2';
  delete require.cache[require.resolve('../src/config.js')];
  delete require.cache[require.resolve('../src/sheets.js')];
});

test('listItems returns parsed array', async () => {
  global.fetch = async () =>
    new Response(JSON.stringify([ITEM]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const { listItems } = freshGateway();
  const out = await listItems();
  assert.equal(out.length, 1);
  assert.equal(out[0].NAME, 'Alice');
});

test('listItems coerces non-array json to empty list', async () => {
  global.fetch = async () =>
    new Response(JSON.stringify({ not: 'array' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const { listItems } = freshGateway();
  const out = await listItems();
  assert.deepEqual(out, []);
});
