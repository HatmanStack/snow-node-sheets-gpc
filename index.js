'use strict';

const express = require('express');
const { google } = require('googleapis');
const { z } = require('zod');
const crypto = require('node:crypto');

// ---- Config (env-driven, no hardcoded defaults for prod identifiers) ----
function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const CONFIG = {
  port: Number(process.env.PORT || 8080),
  spreadsheetId: required('SPREADSHEET_ID'),
  sheetRange: process.env.SHEET_RANGE || 'A2:E2',
  submitUrl: required('API_GATEWAY_SUBMIT_URL'),
  listUrl: required('API_GATEWAY_LIST_URL'),
  fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS || 10_000),
  fetchMaxRetries: Number(process.env.FETCH_MAX_RETRIES || 3),
};

// ---- Schemas ----
const ItemSchema = z.object({
  TS: z.string().min(1).max(64),
  NAME: z.string().min(1).max(200),
  DAYS: z.string().min(1).max(20),
  DIET: z.string().min(0).max(500),
  PAY: z.string().min(0).max(50),
});
const ListSchema = z.array(ItemSchema);

// ---- Sheets auth (singleton; no per-request rebuild) ----
const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
google.options({ auth });
const sheets = google.sheets('v4');

// ---- Errors ----
function httpError(status, code, message = code) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

function htmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---- HTTP helpers ----
async function fetchJson(url, init = {}) {
  const { fetchTimeoutMs, fetchMaxRetries } = CONFIG;
  let attempt = 0;
  // Exponential backoff: 200ms, 400ms, 800ms ...
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), fetchTimeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      if (res.status >= 500 && attempt < fetchMaxRetries) {
        throw new Error(`upstream ${res.status}`);
      }
      return res;
    } catch (err) {
      if (attempt >= fetchMaxRetries) throw err;
      const delay = 200 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---- Domain ----
async function getLatestRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: CONFIG.sheetRange,
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return ItemSchema.parse({
    TS: String(r[0] ?? ''),
    NAME: String(r[1] ?? ''),
    DAYS: String(r[2] ?? ''),
    DIET: String(r[3] ?? ''),
    PAY: String(r[4] ?? ''),
  });
}

async function submitItem(item) {
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(item.TS + '|' + item.NAME)
    .digest('hex');
  const res = await fetchJson(CONFIG.submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw httpError(502, 'upstream_submit_failed');
  return { idempotencyKey };
}

async function listItems() {
  const res = await fetchJson(CONFIG.listUrl);
  if (!res.ok) throw httpError(502, 'upstream_list_failed');
  const json = await res.json();
  return ListSchema.parse(Array.isArray(json) ? json : []);
}

// ---- Express ----
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/readyz', (_req, res) => res.json({ ok: true }));

// GET / is now non-mutating. Trigger lives at POST /trigger.
app.get('/', (_req, res) => res.json({ service: 'dynamo-node-sheets-gpc', ok: true }));

app.post('/trigger', async (_req, res, next) => {
  try {
    const item = await getLatestRow();
    if (!item) return res.status(204).end();
    const out = await submitItem(item);
    res.json({ ok: true, item, idempotencyKey: out.idempotencyKey });
  } catch (err) {
    next(err);
  }
});

app.get('/data', async (_req, res, next) => {
  try {
    const items = await listItems();
    res.json(items);
  } catch (err) {
    next(err);
  }
});

app.get('/dashboard', async (_req, res, next) => {
  try {
    const items = await listItems();
    items.sort((a, b) => new Date(b.TS) - new Date(a.TS));
    const rows = items
      .map(
        (i) => `<tr>
        <td>${htmlEscape(i.TS)}</td>
        <td>${htmlEscape(i.NAME)}</td>
        <td>${htmlEscape(i.DAYS)}</td>
        <td>${htmlEscape(i.DIET)}</td>
        <td>${htmlEscape(i.PAY)}</td>
      </tr>`
      )
      .join('');
    res.set(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'"
    );
    res.set('X-Content-Type-Options', 'nosniff');
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8">
      <title>Form Submissions</title>
      <style>body{font-family:sans-serif;margin:40px;background:#f4f4f9}
      table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;
      overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1)}
      th,td{padding:12px 15px;text-align:left;border-bottom:1px solid #ddd}
      th{background:#007bff;color:#fff}tr:hover{background:#f1f1f1}</style></head>
      <body><h2>Form Submissions (DynamoDB)</h2>
      <table><thead><tr><th>Timestamp</th><th>Name</th><th>Days</th><th>Diet</th>
      <th>Pay</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  } catch (err) {
    next(err);
  }
});

// Structured error handler — never leaks upstream bodies.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const code = err.code || 'internal_error';
  console.error(JSON.stringify({ level: 'error', code, status, msg: err.message }));
  res.status(status).json({ error: { code, message: code } });
});

const server = app.listen(CONFIG.port, () => {
  console.log(JSON.stringify({ level: 'info', msg: 'listening', port: CONFIG.port }));
});

// Graceful shutdown for Cloud Run SIGTERM.
process.on('SIGTERM', () => server.close(() => process.exit(0)));
