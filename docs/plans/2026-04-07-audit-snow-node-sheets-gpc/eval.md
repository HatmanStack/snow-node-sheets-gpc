---
type: repo-eval
date: 2026-04-07
role_level: Senior Developer
focus_areas: balanced
pillar_overrides: none
---

## HIRE EVALUATION — The Pragmatist

### VERDICT

- **Decision:** CAUTIOUS HIRE
- **Overall Grade:** B
- **One-Line:** Small, honest glue service that does what it claims; several smells (hardcoded IDs, inline HTML, version typo) keep it out of "solid" territory.

### SCORECARD

| Pillar               | Score | Evidence                                                                                                                                                                                                     |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Problem-Solution Fit | 8/10  | `index.js:14-71` — single Express route glues Sheets → API Gateway → DynamoDB; no overengineering. `README.md:15-21` architecture matches 1:1.                                                               |
| Architecture         | 5/10  | `index.js:1-173` — entire app (config, auth, logic, HTML view, proxy) in 173 lines; `index.js:108-170` embeds full HTML/CSS/JS dashboard as template string.                                                 |
| Code Quality         | 6/10  | `index.js:27-28` hardcoded `spreadsheetId` and `range: 'A2:E2'`; `index.js:93` hardcoded API Gateway URL duplicating env-var pattern from `index.js:11`; `package.json:3` version `"2.0.0."` invalid semver. |
| Creativity           | 6/10  | `index.js:91-105` `/data` CORS-avoidance proxy is pragmatic; `index.js:96-99` defensive `Array.isArray` check. Nothing elegant beyond that.                                                                  |

### HIGHLIGHTS

- **Brilliance:** Pragmatic CORS-avoidance proxy (`index.js:91-105`); tagged log levels make Cloud Run logs grep-friendly.
- **Concerns:** Hardcoded spreadsheet ID, second API Gateway URL not env-driven, 60+ lines of inline HTML, invalid semver, no tests/lint.

### REMEDIATION TARGETS

- **Architecture (5 → 9):** Split into `src/sheets.js`, `src/gateway.js`, `src/routes/`, `src/server.js`; move dashboard to `public/`; centralize config in `src/config.js`. Complexity: LOW.
- **Code Quality (6 → 9):** Fix semver, env-drive all identifiers, add eslint+prettier, add `supertest` suite, add zod input validation. Complexity: LOW.
- **Creativity (6 → 9):** Idempotency key from `TS`, `/healthz` probe, signed requests to API Gateway. Complexity: MEDIUM.

EVAL_HIRE_COMPLETE

---

## STRESS EVALUATION — The Oncall Engineer

### VERDICT

- **Decision:** NO HIRE
- **Seniority Alignment:** Below Senior — junior/hobbyist work masquerading as production
- **One-Line:** Hardcoded creds, hardcoded URLs, XSS-prone dashboard, no tests, no retries, no auth — runbook will be "rotate the leaked Google service account key."

### SCORECARD

| Pillar        | Score | Evidence                                                                                                                                                                            |
| ------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pragmatism    | 6/10  | Small for scope (`index.js:1-174`), but `Dockerfile:3` says Node 16 vs `package.json:10` `>=12`; version `"2.0.0."` (`package.json:4`) trailing dot.                                |
| Defensiveness | 2/10  | No retries on fetch (`index.js:50,93`); `/data` no timeout (`index.js:93`); `GET /` unauthenticated mutating endpoint (`index.js:80-88`); nil-check after deref (`index.js:83-86`). |
| Performance   | 4/10  | `tbody.innerHTML += row` O(n²) reflow (`index.js:157`); `google.options({auth})` global state per request (`index.js:23`); auth client rebuilt per request.                         |
| Type Rigor    | 3/10  | Plain JS, no JSDoc; `data[1..4]` blindly indexed (`index.js:41-46`) yields literal `"undefined"` strings; no schema on API Gateway response.                                        |

### CRITICAL FAILURE POINTS

- `creds.json` — GCP service account key on disk (Mar 25). Rotate immediately. Referenced `index.js:18`, force-copied `Dockerfile:20`.
- `index.js:11,27,93` — Hardcoded API Gateway URL and Sheet ID; `/data` not env-overridable.
- `index.js:139-166` — Dashboard interpolates `item.TS/NAME/...` into HTML, no escaping. Stored XSS.
- `index.js:80-88` — `GET /` mutates state, no auth, no rate limit, no idempotency.
- `index.js:50,93` — Fetches with no timeout, no retry, no circuit breaker.
- `index.js:26-29` — Hardcoded range `A2:E2`; only one row processed.
- `index.js:75-77` — No graceful shutdown, no SIGTERM, no health endpoint.
- `Dockerfile:14` — `npm install` instead of `npm ci`, runs as root, no HEALTHCHECK.
- `package.json:4` — invalid semver.
- No tests, no linter, no CI for the app itself.

### REMEDIATION TARGETS

- **Pragmatism 6 → 9:** Fix version, align Node, move bootstrap artifacts. Trivial.
- **Defensiveness 2 → 9:** Purge creds, rotate key, add auth, AbortController timeouts + retries with backoff, idempotency key, `/healthz`+`/readyz`, structured logging, SIGTERM, schema validation. ~1 day.
- **Performance 4 → 9:** Cache `GoogleAuth` singleton; `DocumentFragment` for dashboard; serve static HTML. Trivial.
- **Type Rigor 3 → 9:** zod boundary validation or full TS migration. ~half-1 day.

EVAL_STRESS_COMPLETE

---

## DAY 2 EVALUATION — The Team Lead

### VERDICT

- **Decision:** SOLO CODER
- **Collaboration Score:** L
- **One-Line:** Working demo with decent CI hygiene, but zero tests, committed credentials, and no onboarding scaffolding mean a junior is blocked on day one.

### SCORECARD

| Pillar          | Score | Evidence                                                                                                                                                                       |
| --------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Test Value      | 1/10  | No test files (`**/*.test.*` empty); `package.json` has only `start`, no `test` script.                                                                                        |
| Reproducibility | 5/10  | `package-lock.json`, `Dockerfile`, `cloudbuild.yaml` present; but `Dockerfile` hardcodes `COPY creds.json`, Node 16 vs `>=12` drift, no `.env.example`, no local-run docs.     |
| Git Hygiene     | 6/10  | Recent commits use conventional style (`ci:`, `chore:`, `feat:`), dependabot+auto-merge in `.github/`; early history sloppy (`Emoji`, `Folder Cloud Run`); single contributor. |
| Onboarding      | 3/10  | `README.md` describes architecture/deploy, `CHANGELOG.md` exists; no `.env.example`, no `CONTRIBUTING.md`, no `Makefile`, setup is a 6-bullet hand-wave.                       |

### RED FLAGS

- `creds.json` committed-pattern (on disk + Dockerfile copy) — credential leak.
- Zero automated tests across Sheets→Cloud Run→API Gateway→DynamoDB.
- `package.json` version `"2.0.0."` invalid; name `node-sheets-to-snow` stale vs DynamoDB migration (`17721a6`).
- Node version drift (`Dockerfile` Node 16 EOL vs `engines` `>=12`).
- `trust-policy.json`/`role-policy.json` undocumented.

### HIGHLIGHTS

- **Process Win:** `.github/workflows` + dependabot + auto-merge w/ CI gate (`7507ac5`, `e7bbe6e`) — more CI maturity than the code warrants.
- **Process Win:** `CHANGELOG.md` maintained.
- **Maintenance Drag:** Single-file service with no module boundaries; any junior change risks regressions.

### REMEDIATION TARGETS

- **Test Value (1 → 9):** Add Jest/node:test; unit tests for parser + payload shaper, one mocked integration. Wire to CI. Complexity: MEDIUM (1-2 days).
- **Reproducibility (5 → 9):** Remove `creds.json`, rotate key, load via env, pin `node:20-alpine`, add `.dockerignore`. Complexity: MEDIUM.
- **Git Hygiene (6 → 9):** Commitlint + husky or PR-title lint; document branch policy. Complexity: SMALL.
- **Onboarding (3 → 9):** `.env.example`, `CONTRIBUTING.md`, `Makefile`, expanded README runbook. Complexity: SMALL-MEDIUM.

EVAL_DAY2_COMPLETE
