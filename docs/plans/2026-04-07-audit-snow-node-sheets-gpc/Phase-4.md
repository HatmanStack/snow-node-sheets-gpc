# Phase 4: [FORTIFIER] Tooling, tests, CI gating, Dockerfile hardening

## Phase Goal

Add the guardrails that prevent regressions: lint, format, tests, CI gating, pre-commit hook,
JSDoc type checking, and a hardened Dockerfile that pins Node 20, runs as a non-root user, uses
`npm ci --omit=dev`, and includes a `HEALTHCHECK`.

**Success criteria:**

- `npm run lint`, `npm run format:check`, `npm test`, `npm run typecheck` all exist and pass
  cleanly on `main`.
- `.github/workflows/ci.yml` (new) runs all four on PRs and required-status-checks them.
- `husky` (or a `core.hooksPath`-based shell hook) runs lint+format+test on `pre-commit`.
- Test coverage >= 70% line on `src/`.
- `Dockerfile` uses `node:20-alpine`, `npm ci --omit=dev`, runs as non-root `USER node`, and has
  a `HEALTHCHECK` that hits `/healthz`.
- `package.json` `engines.node` pinned to `"20.x"`.

**Estimated tokens:** ~30k

## Prerequisites

- Phases 1-3 merged.

## Tasks

### Task 4.1: Add ESLint + Prettier

- **Files to Create:** `.eslintrc.json`, `.prettierrc.json`, `.prettierignore`
- **Files to Modify:** `package.json`
- **Implementation Steps:**
  1. `npm install --save-dev eslint @eslint/js eslint-config-prettier prettier`.
  1. `.eslintrc.json` extends `eslint:recommended` and `prettier`. Env: `node: true`,
     `es2022: true`. Rules: `no-unused-vars: error`, `no-console: off`, `eqeqeq: error`.
  1. `.prettierrc.json`: `{ "singleQuote": true, "semi": true, "printWidth": 100 }`.
  1. `.prettierignore`: `node_modules`, `coverage`, `package-lock.json`, `public/dashboard.html`.
  1. Add scripts to `package.json`:

     ```json
     {
       "scripts": {
         "start": "node index.js",
         "lint": "eslint .",
         "format": "prettier --write .",
         "format:check": "prettier --check .",
         "test": "node --test --test-reporter=spec test",
         "typecheck": "tsc --noEmit"
       }
     }
     ```

  1. Run `npm run lint -- --fix` and `npm run format` once and commit the resulting changes.

- **Verification Checklist:**
  - [ ] `npm run lint` exits 0.
  - [ ] `npm run format:check` exits 0.
- **Commit Message Template:** `chore(lint): add eslint and prettier with passing baseline`

### Task 4.2: Add JSDoc-based type checking

- **Files to Create:** `tsconfig.json`
- **Files to Modify:** Add JSDoc `@param` / `@returns` annotations to public functions in
  `src/sheets.js`, `src/gateway.js`, `src/config.js`.
- **Implementation Steps:**
  1. `npm install --save-dev typescript @types/node @types/express`.
  1. `tsconfig.json`:

     ```json
     {
       "compilerOptions": {
         "target": "es2022",
         "module": "commonjs",
         "allowJs": true,
         "checkJs": true,
         "noEmit": true,
         "strict": true,
         "esModuleInterop": true,
         "skipLibCheck": true,
         "resolveJsonModule": true
       },
       "include": ["src/**/*.js", "index.js"]
     }
     ```

  1. Add JSDoc types until `npm run typecheck` exits 0.

- **Verification Checklist:**
  - [ ] `npm run typecheck` exits 0.
- **Commit Message Template:** `chore(types): enable JSDoc typechecking via tsc --noEmit`

### Task 4.3: Add tests with node:test + supertest

- **Files to Create:**
  - `test/config.test.js`
  - `test/sheets.test.js`
  - `test/gateway.test.js` (mocks global `fetch`)
  - `test/routes.test.js` (uses `supertest` against `createApp()` with mocked `sheets`/`gateway`
    via `require.cache` injection or a tiny DI seam)
- **Implementation Steps:**
  1. `npm install --save-dev supertest c8`.
  1. Add coverage script: `"test:cov": "c8 --reporter=text --check-coverage --lines=70 npm test"`.
  1. Tests to include (minimum):
     - `config.test.js`: throws when required env var missing; defaults `SHEET_RANGE` to `A2:E2`.
     - `gateway.test.js`: `fetchJson` aborts after timeout; retries 5xx N times; succeeds on
       first 2xx; `submitItem` sends `Idempotency-Key`; `listItems` rejects non-array via zod.
     - `routes.test.js`: `GET /healthz` 200; `GET /` 200 non-mutating; `POST /trigger` calls
       `submitItem` once and returns the item; `GET /dashboard` returns escaped HTML when row
       contains `<script>`.
  1. Use a small DI seam: each route module accepts its dependencies via a factory function so
     tests can pass mocks. (E.g., `module.exports = function makeRouter({ sheets, gateway }) { ... }`.)
     Update `src/server.js` to wire real implementations.
- **Verification Checklist:**
  - [ ] `npm test` exits 0.
  - [ ] `npm run test:cov` exits 0 with >=70% line coverage on `src/`.
- **Commit Message Template:**

  ```text
  test: add node:test + supertest suite with 70% coverage gate

  Covers config validation, gateway timeout/retry/idempotency behavior,
  HTTP routes via supertest, and dashboard XSS escaping.
  ```

### Task 4.4: Add CI workflow gating lint+format+test+typecheck

- **Files to Create:** `.github/workflows/ci.yml`
- **Implementation Steps:**
  1. Workflow:

     ```yaml
     name: ci
     on:
       pull_request:
       push:
         branches: [main]
     jobs:
       check:
         runs-on: ubuntu-latest
         steps:
           - uses: actions/checkout@v4
           - uses: actions/setup-node@v4
             with:
               node-version: '20'
               cache: 'npm'
           - run: npm ci
           - run: npm run lint
           - run: npm run format:check
           - run: npm run typecheck
           - run: npm run test:cov
     ```

  1. In the GitHub repo settings, mark `check` as a required status check on `main`. (Manual
     step; record it in the PR description.)

- **Verification Checklist:**
  - [ ] PR opened against `main` runs the `check` job and it passes.
- **Commit Message Template:** `ci: gate PRs on lint, format, typecheck, and test coverage`

### Task 4.5: Add pre-commit hook with husky

- **Files to Create:** `.husky/pre-commit`
- **Files to Modify:** `package.json`
- **Implementation Steps:**
  1. `npm install --save-dev husky lint-staged`.
  1. `npx husky init` (creates `.husky/pre-commit`).
  1. Replace `.husky/pre-commit` with:

     ```bash
     #!/usr/bin/env sh
     . "$(dirname -- "$0")/_/husky.sh"
     npx lint-staged
     npm test --silent
     ```

  1. Add to `package.json`:

     ```json
     {
       "lint-staged": {
         "*.js": ["eslint --fix", "prettier --write"],
         "*.{json,md,yml,yaml}": ["prettier --write"]
       }
     }
     ```

- **Verification Checklist:**
  - [ ] A test commit with a deliberately misformatted JS file is auto-fixed by the hook.
- **Commit Message Template:** `chore: add husky pre-commit running lint-staged and tests`

### Task 4.6: Harden Dockerfile

- **Files to Modify:** `Dockerfile`
- **Implementation Steps:**
  1. Replace `Dockerfile` with:

     ```dockerfile
     # Pinned Node 20 LTS Alpine for small attack surface and matched engines.
     FROM node:20-alpine

     WORKDIR /usr/src/app

     # Install only production deps with a deterministic lockfile.
     COPY package.json package-lock.json ./
     RUN npm ci --omit=dev && npm cache clean --force

     # Copy application source. .dockerignore excludes secrets, tests, VCS.
     COPY index.js ./
     COPY src ./src
     COPY public ./public

     # Drop privileges.
     USER node

     ENV NODE_ENV=production
     EXPOSE 8080

     HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
       CMD wget -q -O - http://127.0.0.1:8080/healthz || exit 1

     CMD ["node", "index.js"]
     ```

  1. Update `package.json` `engines.node` to `"20.x"`.

- **Verification Checklist:**
  - [ ] `docker build .` succeeds.
  - [ ] `docker run --rm -e SPREADSHEET_ID=x ... <image> node -e "console.log(process.getuid())"`
        prints a non-zero uid (the `node` user).
  - [ ] Image does not contain `creds.json` or `node_modules/.cache`:
        `docker run --rm <image> sh -c 'ls /usr/src/app && find / -name creds.json 2>/dev/null'`.
- **Commit Message Template:**

  ```text
  build(docker): harden image (node:20-alpine, npm ci --omit=dev, USER node, HEALTHCHECK)
  ```

## Phase Verification

- [ ] All 6 task checklists pass.
- [ ] Eval Test Value rises from 1 -> 8.
- [ ] Eval Reproducibility rises from 5 -> 9.
- [ ] All HIGH item 6 (no linter/tests/CI) and MEDIUM items 1, 2, 6 from `health-audit.md` are
      addressed.
