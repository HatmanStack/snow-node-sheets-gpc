'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONFIG_PATH = require.resolve('../src/config.js');

function loadConfig(env) {
  const saved = { ...process.env };
  for (const k of [
    'PORT',
    'SPREADSHEET_ID',
    'SHEET_RANGE',
    'API_GATEWAY_SUBMIT_URL',
    'API_GATEWAY_LIST_URL',
    'FETCH_TIMEOUT_MS',
    'FETCH_MAX_RETRIES',
  ]) {
    delete process.env[k];
  }
  Object.assign(process.env, env);
  delete require.cache[CONFIG_PATH];
  try {
    return require('../src/config.js');
  } finally {
    process.env = saved;
    delete require.cache[CONFIG_PATH];
  }
}

test('config throws when SPREADSHEET_ID missing', () => {
  assert.throws(
    () =>
      loadConfig({
        API_GATEWAY_SUBMIT_URL: 'https://x',
        API_GATEWAY_LIST_URL: 'https://y',
      }),
    /SPREADSHEET_ID/,
  );
});

test('config throws when API_GATEWAY_SUBMIT_URL missing', () => {
  assert.throws(
    () =>
      loadConfig({
        SPREADSHEET_ID: 's',
        API_GATEWAY_LIST_URL: 'https://y',
      }),
    /API_GATEWAY_SUBMIT_URL/,
  );
});

test('config defaults SHEET_RANGE to A2:E2', () => {
  const cfg = loadConfig({
    SPREADSHEET_ID: 's',
    API_GATEWAY_SUBMIT_URL: 'https://x',
    API_GATEWAY_LIST_URL: 'https://y',
  });
  assert.equal(cfg.sheetRange, 'A2:E2');
  assert.equal(cfg.fetchTimeoutMs, 10000);
  assert.equal(cfg.fetchMaxRetries, 3);
  assert.equal(cfg.port, 8080);
});

test('config respects overrides', () => {
  const cfg = loadConfig({
    PORT: '9090',
    SPREADSHEET_ID: 's',
    SHEET_RANGE: 'B2:F2',
    API_GATEWAY_SUBMIT_URL: 'https://x',
    API_GATEWAY_LIST_URL: 'https://y',
    FETCH_TIMEOUT_MS: '500',
    FETCH_MAX_RETRIES: '1',
  });
  assert.equal(cfg.port, 9090);
  assert.equal(cfg.sheetRange, 'B2:F2');
  assert.equal(cfg.fetchTimeoutMs, 500);
  assert.equal(cfg.fetchMaxRetries, 1);
});

// Silence unused
void path;
