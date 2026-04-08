# Phase 3: [IMPLEMENTER] Modularize index.js

## Phase Goal

Take the now-secure single-file `index.js` from Phase 2 and split it into the module layout from
ADR-003. No behavior changes — this is a pure refactor that makes the code testable in Phase 4.

**Success criteria:**

- `src/` directory exists with the layout from ADR-003.
- `index.js` is a 1-3 line bootstrap that requires `./src/server.js`.
- Every module has a single responsibility.
- No env vars are read outside `src/config.js`.
- The dashboard HTML template lives in `public/dashboard.html` and is rendered with a tiny
  inline `${rows}` substitution by `src/routes/dashboard.js`. (We do not pull in a template
  engine; the file is read once at startup.)
- Manual smoke test passes against the deployed service.

**Estimated tokens:** ~30k

## Prerequisites

- Phase 2 merged.

## Tasks

### Task 3.1: Create src/config.js

- **Goal:** Centralize env var reads and validation.
- **Files to Create:** `src/config.js`
- **Implementation Steps:**
  1. Move the `CONFIG` object and `required()` helper from `index.js` into `src/config.js`.
  1. Export the frozen config object: `module.exports = Object.freeze(CONFIG);`
  1. `require('./config')` will throw at startup if any required env var is missing — keep this
     fail-fast behavior.
- **Verification Checklist:**
  - [x] No `process.env` reads in any other `src/` file.
- **Commit Message Template:**

  ```text
  refactor(config): extract env-driven configuration to src/config.js
  ```

### Task 3.2: Create src/sheets.js

- **Goal:** Encapsulate the Google Sheets client and `getLatestRow()`.
- **Files to Create:** `src/sheets.js`
- **Implementation Steps:**
  1. Move the `GoogleAuth` setup, the `sheets` client, the `ItemSchema`, and `getLatestRow()`
     into this file.
  1. Export `{ getLatestRow }` and the `ItemSchema` (for reuse by `src/gateway.js`).
- **Verification Checklist:**
  - [x] `getLatestRow()` is the only exported behavior.
  - [x] Importing this file does NOT call any Google API; the auth client is lazy or constructed
        at module load but does not perform network IO until `getLatestRow()` runs.
- **Commit Message Template:**

  ```text
  refactor(sheets): extract Google Sheets client into src/sheets.js
  ```

### Task 3.3: Create src/gateway.js

- **Goal:** Encapsulate API Gateway calls and the `fetch+timeout+retry` helper.
- **Files to Create:** `src/gateway.js`
- **Implementation Steps:**
  1. Move `fetchJson()`, `submitItem()`, `listItems()`, `ListSchema`, and `httpError()` into
     this file. (`httpError` may also live in a tiny `src/errors.js` if the implementer prefers;
     either is acceptable.)
  1. Export `{ submitItem, listItems }`.
- **Verification Checklist:**
  - [x] `fetch` is called only inside this module.
  - [x] Retry/backoff parameters come from `src/config.js`.
- **Commit Message Template:**

  ```text
  refactor(gateway): extract API Gateway client into src/gateway.js
  ```

### Task 3.4: Extract dashboard to public/dashboard.html

- **Goal:** Pull the inline HTML out of code.
- **Files to Create:** `public/dashboard.html`
- **Files to Modify:** `src/routes/dashboard.js` (created in this task)
- **Implementation Steps:**
  1. Save the dashboard HTML from Phase 2 to `public/dashboard.html` with a single placeholder
     `<!--ROWS-->` where the `<tbody>` rows go.
  1. In `src/routes/dashboard.js`, read the file once at module load with
     `fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'dashboard.html'), 'utf8')`,
     cache it, and on each request build the rows HTML, escape with `htmlEscape`, and string-
     replace `<!--ROWS-->`.
  1. Set the same CSP and `X-Content-Type-Options` headers from Phase 2.
- **Verification Checklist:**
  - [x] `grep -n "<table" src/` returns no matches (HTML lives in `public/`).
  - [x] Dashboard still renders correctly when smoke-tested.
- **Commit Message Template:**

  ```text
  refactor(dashboard): move dashboard HTML to public/dashboard.html
  ```

### Task 3.5: Create src/routes/{trigger,data,health}.js

- **Goal:** One file per route.
- **Files to Create:**
  - `src/routes/trigger.js` exports an Express router with `POST /trigger`.
  - `src/routes/data.js` exports an Express router with `GET /data`.
  - `src/routes/health.js` exports an Express router with `GET /healthz` and `GET /readyz` and
    `GET /` (the non-mutating service blurb).
- **Implementation Steps:**
  1. Each router file uses `express.Router()`, depends only on `src/sheets.js`, `src/gateway.js`,
     and a small `src/errors.js` (or inline `httpError`).
  1. No business logic in `src/server.js` — it only wires routers and middleware.
- **Verification Checklist:**
  - [x] `grep -nE "app\\.(get|post|put|delete)\\(" src/routes/` returns no results
        (route files use `router.get/post`, not `app`).
- **Commit Message Template:**

  ```text
  refactor(routes): split HTTP handlers into per-route modules
  ```

### Task 3.6: Create src/server.js and shrink index.js

- **Goal:** Wire everything in a small server module; reduce `index.js` to a bootstrap.
- **Files to Create:** `src/server.js`
- **Files to Modify:** `index.js`
- **Implementation Steps:**
  1. `src/server.js` exports a `createApp()` function that returns the Express app (no
     `app.listen`). Tests in Phase 4 will import `createApp()` directly with `supertest`.
  1. `src/server.js` ALSO exports a `start()` function that calls `createApp()`, listens on
     `CONFIG.port`, and installs the `SIGTERM` handler.
  1. `index.js` becomes:

     ```js
     'use strict';
     require('./src/server').start();
     ```
- **Verification Checklist:**
  - [x] `wc -l index.js` is `<= 5`.
  - [x] `node index.js` (with required env vars set) starts the server.
- **Commit Message Template:**

  ```text
  refactor(server): introduce src/server.js with createApp/start split

  index.js is now a 2-line bootstrap. createApp() returns an Express app
  without listening so Phase 4 supertest can mount it directly.
  ```

## Phase Verification

- [x] `tree src public` matches the layout from ADR-003.
- [ ] Manual smoke test against a redeploy passes (`/healthz`, `/dashboard`, `POST /trigger`).
- [x] No file in `src/` exceeds 150 lines.
- [ ] Eval Architecture rises from 5 -> 8.
