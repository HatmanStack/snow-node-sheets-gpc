---
type: repo-health
date: 2026-04-07
goal: General health check
deployment: Serverless (Lambda/Cloud Functions)
---

## REMEDIATION DIRECTIVE (user-specified)

**Auth model:** Cloud Run service must be locked down by removing `--allow-unauthenticated` from `cloudbuild.yaml:12` and requiring IAM auth. The only legitimate caller is a Google Apps Script in Google Drive, which will be updated to call the service with an **OIDC identity token** (via `ScriptApp.getIdentityToken()` or `UrlFetchApp` with a service-account-signed token) sent as `Authorization: Bearer <token>`. The Apps Script's service account (or the script's own identity) must be granted the `roles/run.invoker` IAM role on the Cloud Run service.

This single change is the primary mitigation for the unauthenticated `GET /`, `/data` Scan abuse, and stored XSS exposure. All other CRITICAL/HIGH findings remain in scope but are evaluated against this auth model (e.g., the dashboard XSS becomes lower-risk once only the Apps Script identity can write rows, but still needs escaping).

---

## CODEBASE HEALTH AUDIT

### EXECUTIVE SUMMARY

- **Overall health: POOR**
- **Biggest structural risk:** The entire application is a single 174-line `index.js` that mixes an Express server, Google Sheets client, AWS API Gateway client, business logic, and an inline HTML/JS dashboard — no modules, no tests, no separation of concerns.
- **Biggest operational risk:** A live GCP service-account private key sits at `creds.json` and is baked into the Docker image via an explicit `COPY creds.json` (`Dockerfile:20`) that bypasses `.gitignore`; key must be considered compromised.
- **Total findings:** 4 critical, 6 high, 7 medium, 5 low

### TECH DEBT LEDGER

#### CRITICAL

1. **[Operational / Hygiene]** `creds.json:1-13`
   - **The Debt:** Real GCP service-account JSON key (project `gemenielabs-snowflake`, full RSA private key) on disk. `Dockerfile:20` explicitly `COPY creds.json ./creds.json`, shipping the secret into every built image and any registry.
   - **The Risk:** Anyone with read access to the container image (Cloud Build artifacts, GCR, leaked layer) obtains Sheets-API access. Key should be treated as leaked and rotated.

2. **[Operational]** `index.js:11,93`
   - **The Debt:** Hard-coded AWS API Gateway URLs (`xki0e95t5c.execute-api.us-east-1.amazonaws.com/prod/submit` and `/prod/submit/list`) and a hard-coded Google Sheet ID (`index.js:27`). The `/submit/list` endpoint has no env-var override.
   - **The Risk:** Endpoint is an unauthenticated public DynamoDB write/scan proxy (`role-policy.json` grants `PutItem`+`Scan`). Combined with `--allow-unauthenticated` Cloud Run deploy (`cloudbuild.yaml:12`), creates open write/read path with no auth, no rate limit, no validation — abusable for data poisoning, exfiltration, and cost amplification.

3. **[Operational / Architectural]** `index.js:14-71`
   - **The Debt:** `getInvite` always reads fixed range `A2:E2`, no idempotency, no dedup, no arity validation, no schema validation before DynamoDB write. The `/` route is GET but performs a mutating write, publicly accessible.
   - **The Risk:** Any anonymous HTTP GET to `/` causes a DynamoDB write of whatever sits in `A2:E2`. Crawlers, uptime monitors, browser prefetchers can silently mutate production data. Violates REST semantics and write-safety.

4. **[Operational — Serverless fit]** `index.js:74-77`, `Dockerfile:3,14`
   - **The Debt:** Long-running Express server on `node:16` (EOL Sept 2023), installed with `npm install` (not `npm ci`, not `--omit=dev`), shipping full `googleapis` SDK. `package.json` declares `"engines": "node>=12"`, version `"2.0.0."` (malformed). No `.dockerignore`.
   - **The Risk:** Slow cold-start, unsupported Node runtime with known CVEs, bloated image with secrets and VCS history. The `app.listen` model does not map to FaaS execution.

#### HIGH

1. **[Operational]** `index.js:26-29` — `sheets.spreadsheets.values.get` has no timeout, no retry, no AbortController. Hung Google API call pins request until platform timeout.
2. **[Operational]** `index.js:50-56` — `fetch` to API Gateway has no timeout, no retries, no circuit-breaker. Under partial AWS outage, requests stack until OOM.
3. **[Operational]** `index.js:91-105` — `/data` proxies `submit/list` performing DynamoDB `Scan` on every hit, no pagination, no caching, no auth. O(table) cost per request — denial-of-wallet vector.
4. **[Architectural]** `index.js:108-170` — ~60-line HTML/CSS/JS dashboard template-string-embedded in route handler, mixing presentation/transport/domain. No CSP, no escaping.
5. **[Operational]** `index.js:149-158` — Client dashboard builds rows via `tbody.innerHTML += row` with unescaped interpolation of DynamoDB fields. Combined with unvalidated form submissions (CRITICAL #2/#3), any submitted `<script>` payload becomes stored XSS for every viewer.
6. **[Hygiene]** `index.js` — No linter config, no formatter, no tests, no type checking. Claimed tooling does not exist; CI (`.github/workflows/release.yml`) does not gate on lint/test.

#### MEDIUM

1. **[Hygiene]** `package.json:3` — `"2.0.0."` malformed semver.
2. **[Hygiene]** `package.json:9` — `"engines": ">=12.0.0"` permits Node 12 (EOL); Dockerfile pins Node 16 (EOL). Both unsupported.
3. **[Structural]** `index.js:11,27,93` — Three hard-coded external identifiers scattered; no config module.
4. **[Operational]** `index.js:67-70` — Top-level catch swallows stack traces, returns raw error string in 500 body (`index.js:86`), leaking internal details.
5. **[Operational]** `index.js:58-66` — Returns raw upstream body verbatim, potentially reflecting AWS error structures (request ids, ARNs).
6. **[Architectural]** `Dockerfile:17,20` — `COPY . .` followed by redundant `COPY creds.json ./creds.json` — intentional secret bake-in.
7. **[Hygiene]** `upload_csv.py`, `dynamo_sheets.csv`, `role-policy.json`, `trust-policy.json` — bootstrap artifacts at repo root; `upload_csv.py` has no `requirements.txt`, no README.

#### LOW

1. **[Hygiene]** `index.js:6` — Imports `node-fetch@3.3.2` (ESM-only) into a CommonJS file via `require('node-fetch')`. Will throw at runtime; suggests code may never have run on pinned image.
2. **[Hygiene]** `index.js:1-2` — `path` imported only for `creds.json` path; `__dirname` would suffice.
3. **[Hygiene]** `index.js:72,173-174` — Trailing whitespace/blank lines.
4. **[Hygiene]** `CHANGELOG.md` / `altered.md` — Two parallel changelog-like docs; `altered.md` is a blog post.
5. **[Hygiene]** `cloudbuild.yaml:12` — `--allow-unauthenticated` hard-coded with no justifying comment.

### QUICK WINS

1. `creds.json` — delete and rotate the GCP key immediately (< 15 min).
2. `Dockerfile:20` — remove explicit `COPY creds.json` (< 5 min).
3. `package.json:3` — fix `"2.0.0."` to `"2.0.0"` (< 1 min).
4. `index.js:11,27,93` — move hard-coded URLs/IDs to env vars (< 30 min).
5. Add `.dockerignore` with `node_modules`, `.git`, `creds.json`, `*.csv`, `.github` (< 10 min).
6. `Dockerfile:14` — change `npm install` to `npm ci --omit=dev` (< 5 min).

### AUTOMATED SCAN RESULTS

- **npm audit:** 0 vulnerabilities across 89 prod deps.
- **Dead code:** Single 174-line entry file; `path` import borderline unnecessary. `upload_csv.py` and `dynamo_sheets.csv` are dead bootstrap artifacts.
- **Secrets scan:** 1 CRITICAL — full GCP service-account private key at `creds.json:5` baked into Docker images. Hard-coded AWS API Gateway hostnames at `index.js:11,93` (infra disclosure).
- **Git hygiene:** `creds.json` absent from git history; `.gitignore` present, `.dockerignore` missing.
