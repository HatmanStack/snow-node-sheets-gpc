# Phase 0: Architecture, Conventions, ADRs

This phase contains no code changes. It establishes the technical decisions, conventions, and
shared patterns that all later phases must follow. Implementers should re-read this file before
starting any task in Phases 1-5.

## Project Conventions

- **Runtime:** Node.js 20.x LTS (pinned via `Dockerfile` `FROM node:20-alpine` and
  `package.json` `engines.node = "20.x"`).
- **Package manager:** npm. All installs use `npm ci` (never `npm install`) in CI and Docker.
  Production image installs with `npm ci --omit=dev`.
- **Module system:** CommonJS (matches existing `index.js`). Do NOT migrate to ESM in this plan.
  This decision is what allows us to fix the `node-fetch@3` ESM/CJS bug by replacing `node-fetch`
  with the built-in `fetch` (Node 18+).
- **Branch model:** Trunk-based on `main`. Feature branches per phase, squash-merged.
- **Commit format:** Conventional Commits (`type(scope): subject`). Allowed types:
  `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `build`, `perf`, `revert`.
  Each task in this plan ships as a single atomic commit unless the task explicitly says otherwise.
- **Build/test commands** (will exist after Phase 4):
  - `npm ci`
  - `npm run lint`
  - `npm run format:check`
  - `npm test`
  - `npm start`
- **Deployment command:** `gcloud builds submit` (CD via `cloudbuild.yaml`). After Phase 2 the
  Cloud Run service is private; callers must send `Authorization: Bearer <OIDC token>`.

## ADR-001: Cloud Run authentication via OIDC bearer tokens

- **Status:** Accepted (mandated by user directive in `health-audit.md`).
- **Context:** The service is currently deployed with `--allow-unauthenticated`, exposing a
  public mutating `GET /`, a public DynamoDB scan via `GET /data`, and a public XSS-vulnerable
  dashboard. The only legitimate caller is a Google Apps Script in Google Drive.
- **Decision:** Remove `--allow-unauthenticated` from `cloudbuild.yaml`. Grant the Apps Script's
  identity (or a dedicated service account it can impersonate) `roles/run.invoker` on the Cloud
  Run service `dynamo-node-sheets-gpc`. The Apps Script will be updated (outside this repo) to
  attach an OIDC ID token via `ScriptApp.getIdentityToken()` (or a service-account-signed token
  via `UrlFetchApp`) as `Authorization: Bearer <token>`. Cloud Run validates the token; the
  service does NOT need to validate it again at the application layer.
- **Consequences:** Browser viewers can no longer hit `/dashboard` directly. If a future
  human-browser dashboard is desired, it must use IAP or sign in with Google in a separate flow.
  The XSS finding (Phase 2) is still fixed because defense-in-depth matters even with IAM.

## ADR-002: Replace node-fetch with global fetch

- **Status:** Accepted.
- **Context:** `index.js:6` does `require('node-fetch')` against `node-fetch@3.3.2` which is
  ESM-only and throws at runtime in CommonJS. The CJS file would never have run on the pinned
  image — strong evidence the deployed binary differs from the repo or that this is a latent bug.
- **Decision:** Remove `node-fetch` from dependencies. Use the global `fetch` shipped with Node
  18+ (and 20). Wrap calls in an `AbortController` for timeouts.

## ADR-003: Module layout

- **Status:** Accepted.
- **Decision:** Phase 3 will split `index.js` into:

  ```text
  src/
    config.js        # env-driven config: API_GATEWAY_SUBMIT_URL, API_GATEWAY_LIST_URL,
                     # SPREADSHEET_ID, SHEET_RANGE, PORT, FETCH_TIMEOUT_MS, GOOGLE_APPLICATION_CREDENTIALS
    sheets.js        # Google Sheets client + getLatestRow()
    gateway.js       # API Gateway client: submitItem(), listItems(); fetch+timeout+retry
    validate.js      # zod (or hand-rolled) schema for the row -> item mapping
    routes/
      trigger.js     # POST / handler (was GET /)
      data.js        # GET /data handler
      dashboard.js   # GET /dashboard handler (serves static file)
      health.js      # GET /healthz, GET /readyz
    server.js        # Express wiring
  public/
    dashboard.html   # extracted dashboard, no inline data
  index.js           # 5-line bootstrap that requires src/server.js
  ```

## ADR-004: Validation library

- **Status:** Accepted.
- **Decision:** Use `zod` for boundary validation of (a) the parsed Sheet row before submitting
  to API Gateway and (b) the response from `/submit/list`. `zod` is a small, well-known dep with
  no transitive footprint relative to `googleapis`.

## ADR-005: Test framework

- **Status:** Accepted.
- **Decision:** Use the built-in `node:test` runner plus `node:assert/strict`. No Jest. Rationale:
  zero new runtime deps, fast, and the codebase is small enough that Jest's ergonomic wins do not
  justify the install. HTTP-level tests use `supertest`.

## ADR-006: Secret delivery

- **Status:** Accepted.
- **Decision:** The GCP service-account key MUST NOT be baked into the image. It will be mounted
  via Google Secret Manager and exposed to the container as a file path through the
  `GOOGLE_APPLICATION_CREDENTIALS` env var (Cloud Run `--set-secrets` mounts a secret as a file).
  The application uses `new google.auth.GoogleAuth({ scopes: [...] })` (no `keyFile`) so it will
  read `GOOGLE_APPLICATION_CREDENTIALS` automatically. The existing on-disk `creds.json` key
  must be rotated.

## ADR-007: Naming reconciliation

- **Status:** Accepted.
- **Decision:** Repo dir, `package.json` name, and Cloud Run service name diverge. We pick ONE
  canonical product name: `dynamo-node-sheets-gpc` (matches the deployed Cloud Run service, which
  is the hardest to rename). Update `package.json` name to `dynamo-node-sheets-gpc`. Repo
  directory is renamed only if the user later requests it (out of scope for this plan).

## Shared Testing Strategy

- **Unit tests:** `src/validate.js`, `src/config.js`, the row->item mapping in `src/sheets.js`,
  and the retry/timeout logic in `src/gateway.js` (with `fetch` stubbed).
- **HTTP tests:** `supertest` against `src/server.js` with `sheets.js` and `gateway.js` mocked.
- **Coverage gate:** Fail CI under 70% line coverage on `src/`.
- **CI gating:** `npm run lint && npm run format:check && npm test` are required checks before
  merge to `main` (Phase 4).

## Shared Commit Format

```text
<type>(<scope>): <imperative subject under 72 chars>

<body explaining why, wrapping at 100 chars>

Refs: docs/plans/2026-04-07-audit-snow-node-sheets-gpc/Phase-N.md task X
```

## Out of Scope

- Migrating to TypeScript (JSDoc-only type rigor instead).
- Replacing Express with a smaller framework.
- Rewriting `upload_csv.py` (it is dead bootstrap code; Phase 1 deletes it).
- Renaming the repo directory or the Cloud Run service.
- Migrating `creds.json` history out of git (it was never committed; `gitignore` is sufficient).
- Changing the Apps Script itself (only documenting the required change).
