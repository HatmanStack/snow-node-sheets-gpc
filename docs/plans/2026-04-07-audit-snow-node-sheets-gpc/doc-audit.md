---
type: doc-health
date: 2026-04-07
scope: All docs
language: JS/TS + Python
prevention: markdownlint + lychee
---

## DOCUMENTATION AUDIT

### SUMMARY

- Docs scanned: 3 (README.md, CHANGELOG.md, altered.md)
- Code modules: 2 (index.js, upload_csv.py) + Dockerfile, cloudbuild.yaml, package.json
- Findings: 6 drift, 4 gaps, 2 stale, 0 broken links

### DRIFT

1. `package.json:3` vs `CHANGELOG.md:5`
   - package.json says: `"version": "2.0.0."` (malformed trailing dot)
   - CHANGELOG says: current release `[2.1.0] - 2026-02-27`
2. `package.json:2` → README
   - Name `node-sheets-to-snow`; description `google sheets to snow connector with oauth`
   - README describes a Google Forms → DynamoDB connector. Metadata stale from pre-migration.
3. `Dockerfile:1-3` — comment says "lightweight Node.js 12 image"; FROM is `node:16`.
4. `package.json:10` engines `>=12.0.0` vs `Dockerfile:3` `node:16` vs `CHANGELOG.md:22` ("Node.js 16 compatibility").
5. `index.js:11,93` → `README.md:29-30`
   - Code hardcodes `API_GATEWAY_URL` default AND a second hardcoded URL in `/data` route not configurable via env var. README lists `API_GATEWAY_URL` as the only env var and "optional".
6. `index.js:27` — Spreadsheet ID hardcoded; `altered.md:57` shows `YOUR_SHEET_ID` placeholder implying configurability.

### GAPS

1. `index.js:91-105` — `/data` proxy route undocumented in README.
2. `index.js:108-170` — `/dashboard` route in CHANGELOG/altered.md but not README features/routes.
3. `index.js:80-88` — `GET /` trigger endpoint undocumented in README.
4. `upload_csv.py` — entire bulk-import utility has zero documentation; `dynamo_sheets.csv` undocumented.

### STALE

1. `package.json:2-4` — name `node-sheets-to-snow`, description "snow connector with oauth"; Snowflake removed in CHANGELOG 2.1.0. Repo dir `snow-node-sheets-gpc` also stale.
2. `Dockerfile:1-2` — Node.js 12 comment is stale.

### STALE CODE EXAMPLES

1. `altered.md:55` — Uses `google.sheets({version: 'v4', auth})` pattern; `index.js:4` uses module-level `google.sheets('v4')` + `google.options({auth})`.
2. `altered.md:62` — Builds item without `String(...)` coercion; `index.js:41-46` wraps every field in `String()`.
3. `altered.md:65` — `fetch("YOUR_API_GATEWAY_URL", ...)` placeholder vs env var with hardcoded fallback.
4. `altered.md:84-88` — Deployment uses `gcloud builds submit` + `gcloud run deploy` manually, but `cloudbuild.yaml` is the actual CD path.

### BROKEN LINKS

None detected. README LICENSE/CHANGELOG links resolve. External links not verified.

### CONFIG DRIFT

1. `index.js:11` reads `API_GATEWAY_URL` — documented in README:30.
2. `index.js:74` reads `PORT` — undocumented (Cloud Run convention).
3. `index.js:93` — hardcoded list endpoint, no env var, undocumented.
4. `cloudbuild.yaml:10` deploys to `us-central1` — undocumented.
5. `cloudbuild.yaml:9` service name `dynamo-node-sheets-gpc` differs from repo name `snow-node-sheets-gpc` and package name `node-sheets-to-snow` — three names, none reconciled.
6. `upload_csv.py:5` hardcodes `region_name='us-east-1'` and table `dynamo_sheets` — undocumented.

### STRUCTURE ISSUES

1. README lacks "Routes"/"Usage" section despite three HTTP endpoints.
2. README "Setup" (lines 23-31) is terse; no commands, no local dev, no test docs.
3. `altered.md` is a blog post checked into repo root with no README explanation.
4. Repo name and package name are both Snowflake-era artifacts inconsistent with current architecture.
5. No `.dockerignore`; `Dockerfile:20` workaround `COPY creds.json ./creds.json` implies one exists and excludes creds — undocumented operational footgun.

DOC_AUDIT_COMPLETE
