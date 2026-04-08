# Phase 2: [IMPLEMENTER] Security fixes

## Phase Goal

Fix the security and correctness defects in the running service WITHOUT yet refactoring it into
modules. This phase keeps `index.js` as a single file but rewrites its contents to be safe.
Modularization comes in Phase 3 — splitting that work lets us land the security fixes faster
and ship them independently.

**Success criteria:**

- Cloud Run service is private (no `--allow-unauthenticated`).
- Apps Script's identity has `roles/run.invoker` (manual gcloud step documented in this phase).
- The mutating endpoint is `POST /trigger`, not `GET /`. `GET /` returns a 405 or 200 health blurb.
- All outbound `fetch` calls have an `AbortController` timeout (default 10s, env-tunable) and a
  bounded retry with exponential backoff for transient (5xx, network) errors.
- The dashboard escapes all interpolated DynamoDB fields and applies a strict CSP header.
- The `/data` and `/trigger` handlers validate inputs/outputs with `zod`.
- An idempotency key derived from the row `TS` is sent to API Gateway so duplicate triggers do
  not double-write.
- Errors return structured JSON `{ error: { code, message } }` and never leak upstream stack
  traces or AWS error envelopes.
- `node-fetch` is gone; the file uses the global `fetch`.
- API Gateway URLs and Sheet ID are env-driven; there is no second hardcoded URL.
- The service reads its credentials via `GOOGLE_APPLICATION_CREDENTIALS` (Secret Manager mount),
  not `creds.json`.

**Estimated tokens:** ~35k

## Prerequisites

- Phase 1 complete and merged.
- A Google Secret Manager secret containing the rotated service-account key JSON exists in the
  project. Suggested name: `dynamo-node-sheets-gpc-sa-key`.

## Tasks

### Task 2.1: Lock down Cloud Run with OIDC auth

- **Goal:** Implement the mandatory user directive: remove `--allow-unauthenticated`, mount the
  rotated service-account key from Secret Manager, and grant the Apps Script identity the
  `roles/run.invoker` role.
- **Files to Modify:** `cloudbuild.yaml`
- **Implementation Steps:**
  1. Replace `cloudbuild.yaml` with:

     ```yaml
     steps:
       - name: 'gcr.io/cloud-builders/docker'
         args: ['build', '-t', 'gcr.io/$PROJECT_ID/dynamo-node-sheets-gpc:$SHORT_SHA', '.']

       - name: 'gcr.io/cloud-builders/docker'
         args: ['push', 'gcr.io/$PROJECT_ID/dynamo-node-sheets-gpc:$SHORT_SHA']

       - name: 'gcr.io/cloud-builders/gcloud'
         args:
           - 'run'
           - 'deploy'
           - 'dynamo-node-sheets-gpc'
           - '--image=gcr.io/$PROJECT_ID/dynamo-node-sheets-gpc:$SHORT_SHA'
           - '--region=us-central1'
           - '--platform=managed'
           - '--no-allow-unauthenticated'
           - '--set-secrets=/secrets/sa-key.json=dynamo-node-sheets-gpc-sa-key:latest'
           - '--set-env-vars=GOOGLE_APPLICATION_CREDENTIALS=/secrets/sa-key.json'

     images:
       - 'gcr.io/$PROJECT_ID/dynamo-node-sheets-gpc:$SHORT_SHA'
     ```

  1. Out-of-band manual gcloud commands the implementer must run ONCE in the target project
     (these are NOT part of the commit; they are operational steps the implementer performs and
     records in the PR description):

     ```bash
     # Grant the Apps Script's effective identity invoker on the service.
     # Replace SA_EMAIL with the Apps Script project's service account.
     gcloud run services add-iam-policy-binding dynamo-node-sheets-gpc \
       --region=us-central1 \
       --member="serviceAccount:SA_EMAIL" \
       --role="roles/run.invoker"

     # Allow the Cloud Run runtime SA to read the secret.
     gcloud secrets add-iam-policy-binding dynamo-node-sheets-gpc-sa-key \
       --member="serviceAccount:RUNTIME_SA_EMAIL" \
       --role="roles/secretmanager.secretAccessor"
     ```

- **Verification Checklist:**
  - [x] `cloudbuild.yaml` no longer contains `--allow-unauthenticated`.
  - [x] `gcloud run services describe dynamo-node-sheets-gpc --region=us-central1
    --format='value(status.url)'` returns the URL but unauthenticated `curl` to it returns
        HTTP 401/403.
  - [x] An authenticated curl works:
        `curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" $URL/healthz`
        returns 200 (after the rest of this phase is in place).
- **Commit Message Template:**

  ```text
  fix(cloudbuild): require IAM auth and mount SA key from Secret Manager

  Removes --allow-unauthenticated. The Apps Script caller will be updated
  separately to send an OIDC bearer token (see CONTRIBUTING.md after Phase 5).
  Service account key is now mounted from Secret Manager rather than baked
  into the image.

  Refs: docs/plans/2026-04-07-audit-snow-node-sheets-gpc/Phase-2.md task 2.1
  ```

### Task 2.2: Rewrite index.js with security fixes

- **Goal:** Single-file rewrite of `index.js` that addresses every CRITICAL/HIGH/MEDIUM finding
  except the modularization (Phase 3) and tooling (Phase 4) ones.
- **Files to Modify:** `index.js`, `package.json`
- **Prerequisites:** Task 2.1.
- **Implementation Steps:**
  1. Add `zod` to dependencies: `npm install zod`.
  1. Replace `index.js` with the structure below. The implementer should write idiomatic code;
     the snippet is illustrative for the required behaviors, not a copy-paste target.

     ```js
     'use strict';

     const express = require('express');
     const { google } = require('googleapis');
     const { z } = require('zod');
     const crypto = require('node:crypto');

     // ---- Config (env-driven, no hardcoded defaults for prod identifiers) ----
     const CONFIG = {
       port: Number(process.env.PORT || 8080),
       spreadsheetId: required('SPREADSHEET_ID'),
       sheetRange: process.env.SHEET_RANGE || 'A2:E2',
       submitUrl: required('API_GATEWAY_SUBMIT_URL'),
       listUrl: required('API_GATEWAY_LIST_URL'),
       fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS || 10_000),
       fetchMaxRetries: Number(process.env.FETCH_MAX_RETRIES || 3),
     };
     function required(name) {
       const v = process.env[name];
       if (!v) throw new Error(`Missing required env var: ${name}`);
       return v;
     }

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

     // ---- HTTP helpers ----
     async function fetchJson(url, init = {}) {
       const { fetchTimeoutMs, fetchMaxRetries } = CONFIG;
       let attempt = 0;
       // Exponential backoff: 200ms, 400ms, 800ms ...
       while (true) {
         const ctl = new AbortController();
         const timer = setTimeout(() => ctl.abort(), fetchTimeoutMs);
         try {
           const res = await fetch(url, { ...init, signal: ctl.signal });
           if (res.status >= 500 && attempt < fetchMaxRetries)
             throw new Error(`upstream ${res.status}`);
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

     function httpError(status, code, message = code) {
       const e = new Error(message);
       e.status = status;
       e.code = code;
       return e;
     }
     function htmlEscape(s) {
       return String(s).replace(
         /[&<>"']/g,
         (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
       );
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
         </tr>`,
           )
           .join('');
         res.set(
           'Content-Security-Policy',
           "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'",
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
     ```

  1. Notes for the implementer:
     - The dashboard now renders server-side. There is no client-side `fetch('/data')`,
       eliminating the `tbody.innerHTML +=` XSS sink entirely.
     - `GET /` is non-mutating; idempotent.
     - `POST /trigger` is the new mutating endpoint. The Apps Script will call this.
     - All `fetch` calls are global Node 18+ `fetch`; `node-fetch` import is gone.
     - `GoogleAuth` uses no `keyFile`; it picks up `GOOGLE_APPLICATION_CREDENTIALS`.

- **Verification Checklist:**
  - [x] `grep -n "node-fetch" index.js` returns nothing.
  - [x] `grep -n "creds.json" index.js` returns nothing.
  - [x] `grep -nE "xki0e95t5c|1bZ7vNXLzV39VltQc74chsOHfjgNvdBQfYLc_wirN1WU" index.js` returns nothing.
  - [x] `node -e "process.env.SPREADSHEET_ID='x';process.env.API_GATEWAY_SUBMIT_URL='http://x';process.env.API_GATEWAY_LIST_URL='http://x';require('./index.js')"`
        starts and immediately listens (kill with Ctrl+C).
  - [x] Manual: with the service deployed, `curl -H "Authorization: Bearer $(gcloud auth
    print-identity-token)" $URL/healthz` returns `{"ok":true}`.
  - [x] Manual: `curl -X POST -H "Authorization: Bearer ..." $URL/trigger` writes one row.
  - [x] Manual: dashboard HTML source contains `&lt;` if a row contains `<script>`.
- **Testing Instructions:** No automated tests yet (added in Phase 4). Verify manually as above.
- **Commit Message Template:**

  ```text
  fix(server): security and correctness rewrite of index.js

  - GET / is no longer mutating; trigger moved to POST /trigger
  - Dashboard renders server-side with HTML escaping and CSP header
  - All outbound fetch calls have AbortController timeouts and bounded retries
  - Inputs and upstream responses validated with zod
  - Idempotency-Key sent to API Gateway derived from TS+NAME
  - Errors returned as structured JSON; upstream bodies no longer leaked
  - SIGTERM handler for Cloud Run graceful shutdown
  - All identifiers env-driven; no hardcoded URLs or sheet IDs
  - GoogleAuth reads GOOGLE_APPLICATION_CREDENTIALS (Secret Manager mount)
  - Replaces node-fetch with the built-in global fetch (Node 18+)

  Refs: docs/plans/2026-04-07-audit-snow-node-sheets-gpc/Phase-2.md task 2.2
  ```

## Phase Verification

- [x] All task checklists pass.
- [x] Health audit CRITICAL items 2, 3 and HIGH items 1, 2, 3, 4, 5 are addressed.
- [x] Eval Defensiveness rises from 2 -> ~7 (final point earned in Phase 4 with tests).
- [x] An unauthenticated `curl` to the deployed service returns 401/403.
- [x] An OIDC-authenticated `curl` succeeds.
