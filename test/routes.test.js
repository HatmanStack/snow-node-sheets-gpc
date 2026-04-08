'use strict';

require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const request = require('supertest');

const ITEM = { TS: '2024-01-01', NAME: 'Alice', DAYS: '1', DIET: '', PAY: '' };
const XSS_ITEM = {
  TS: '2024-01-02',
  NAME: '<script>alert(1)</script>',
  DAYS: '1',
  DIET: '',
  PAY: '',
};

/** Inject mock modules into require.cache before loading server. */
function loadServer({ getLatestRow, submitItem, listItems }) {
  // Clear cached modules so a fresh server picks up our mocks.
  const SRC = path.join(__dirname, '..', 'src');
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(SRC)) delete require.cache[k];
  }

  const sheetsPath = require.resolve('../src/sheets.js');
  const gatewayPath = require.resolve('../src/gateway.js');

  // Pre-load real modules so dependents (which use destructured imports of
  // ItemSchema, etc.) keep working, then overwrite the exports.
  const realSheets = require('../src/sheets');
  realSheets.getLatestRow = getLatestRow;
  require.cache[sheetsPath].exports = realSheets;

  // Stub gateway entirely.
  require.cache[gatewayPath] = {
    id: gatewayPath,
    filename: gatewayPath,
    loaded: true,
    exports: { submitItem, listItems },
    children: [],
    paths: Module._nodeModulePaths(path.dirname(gatewayPath)),
  };

  const { createApp } = require('../src/server');
  return createApp();
}

test('GET /healthz returns 200', async () => {
  const app = loadServer({
    getLatestRow: async () => null,
    submitItem: async () => ({ idempotencyKey: 'k' }),
    listItems: async () => [],
  });
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('GET / returns service identity (non-mutating)', async () => {
  const app = loadServer({
    getLatestRow: async () => null,
    submitItem: async () => ({ idempotencyKey: 'k' }),
    listItems: async () => [],
  });
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('POST /trigger calls submitItem once and returns the item', async () => {
  let calls = 0;
  const app = loadServer({
    getLatestRow: async () => ITEM,
    submitItem: async (item) => {
      calls++;
      assert.equal(item.NAME, 'Alice');
      return { idempotencyKey: 'abc' };
    },
    listItems: async () => [],
  });
  const res = await request(app).post('/trigger').send({});
  assert.equal(res.status, 200);
  assert.equal(calls, 1);
  assert.equal(res.body.item.NAME, 'Alice');
  assert.equal(res.body.idempotencyKey, 'abc');
});

test('POST /trigger returns 204 when no row', async () => {
  const app = loadServer({
    getLatestRow: async () => null,
    submitItem: async () => ({ idempotencyKey: 'k' }),
    listItems: async () => [],
  });
  const res = await request(app).post('/trigger');
  assert.equal(res.status, 204);
});

test('GET /data returns items', async () => {
  const app = loadServer({
    getLatestRow: async () => null,
    submitItem: async () => ({ idempotencyKey: 'k' }),
    listItems: async () => [ITEM],
  });
  const res = await request(app).get('/data');
  assert.equal(res.status, 200);
  assert.equal(res.body[0].NAME, 'Alice');
});

test('GET /dashboard escapes HTML in row content', async () => {
  const app = loadServer({
    getLatestRow: async () => null,
    submitItem: async () => ({ idempotencyKey: 'k' }),
    listItems: async () => [XSS_ITEM],
  });
  const res = await request(app).get('/dashboard');
  assert.equal(res.status, 200);
  assert.ok(res.text.includes('&lt;script&gt;'));
  assert.ok(!res.text.includes('<script>alert(1)</script>'));
});

test('error handler returns JSON with code on thrown HttpError', async () => {
  const app = loadServer({
    getLatestRow: async () => {
      const e = new Error('boom');
      // @ts-ignore
      e.status = 502;
      // @ts-ignore
      e.code = 'upstream_submit_failed';
      throw e;
    },
    submitItem: async () => ({ idempotencyKey: 'k' }),
    listItems: async () => [],
  });
  const res = await request(app).post('/trigger');
  assert.equal(res.status, 502);
  assert.equal(res.body.error.code, 'upstream_submit_failed');
});
