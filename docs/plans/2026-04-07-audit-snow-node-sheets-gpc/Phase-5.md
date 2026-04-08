# Phase 5: [DOC-ENGINEER] Documentation rewrite + drift prevention

## Phase Goal

Rewrite the documentation so it matches the post-Phase-4 reality, document the OIDC setup the
Apps Script caller needs, reconcile the three-way naming drift, and add markdownlint + lychee CI
to prevent doc rot from returning.

**Success criteria:**

- `README.md` describes the actual current architecture, routes, env vars, and OIDC auth.
- `.env.example` exists with every env var the app reads.
- `CONTRIBUTING.md` exists with local-dev, test, and Apps Script OIDC instructions.
- `CHANGELOG.md` is updated with a `[3.0.0]` entry covering this remediation.
- `docs/apps-script-oidc.md` documents how to wire the Apps Script side (curl-equivalent calls,
  `ScriptApp.getIdentityToken()` snippet, IAM bindings, troubleshooting).
- `.github/workflows/docs.yml` runs `markdownlint-cli2` and `lychee` on PRs.
- All references to `creds.json`, `upload_csv.py`, `altered.md`, Snowflake, and Node 12/16 are
  removed from docs.
- `lychee` reports zero broken links.

**Estimated tokens:** ~20k

## Prerequisites

- Phases 1-4 merged.

## Tasks

### Task 5.1: Rewrite README.md

- **Files to Modify:** `README.md`
- **Implementation Steps:**
  1. Sections (in order): Title, One-line description, Architecture diagram (ASCII), Routes,
     Environment Variables, Local Development, Testing, Deployment, Authentication (OIDC),
     License.
  1. **Routes** section MUST list, with method/path/auth/description:
     - `GET /` — health blurb (no side effects).
     - `GET /healthz`, `GET /readyz` — liveness/readiness probes.
     - `POST /trigger` — reads latest sheet row and writes to DynamoDB via API Gateway.
     - `GET /data` — proxied DynamoDB list (zod-validated).
     - `GET /dashboard` — server-rendered HTML table (escaped, CSP set).
  1. **Environment Variables** section MUST list, with required/default/description:
     `PORT`, `SPREADSHEET_ID`, `SHEET_RANGE`, `API_GATEWAY_SUBMIT_URL`, `API_GATEWAY_LIST_URL`,
     `FETCH_TIMEOUT_MS`, `FETCH_MAX_RETRIES`, `GOOGLE_APPLICATION_CREDENTIALS`.
  1. **Authentication** section: explain that the service requires `Authorization: Bearer
<OIDC token>`, link to `docs/apps-script-oidc.md`, and show the `gcloud` curl example.
  1. Remove all references to `creds.json`, `upload_csv.py`, `altered.md`, Snowflake, Node 12,
     and Node 16. The Cloud Run service name `dynamo-node-sheets-gpc` and the package name must
     match per ADR-007.
- **Verification Checklist:**
  - [x] `grep -niE "snowflake|creds\\.json|upload_csv|altered\\.md|node 12|node 16" README.md`
        returns no matches.
  - [x] All five routes are documented.
- **Commit Message Template:** `docs(readme): rewrite for current architecture, routes, and OIDC auth`

### Task 5.2: Add .env.example

- **Files to Create:** `.env.example`
- **Implementation Steps:**
  1. One line per env var with a placeholder value and a `#` comment explaining it. Mark required
     vs optional. Do NOT include any real values.
- **Verification Checklist:**
  - [x] Every env var named in `src/config.js` appears in `.env.example`.
- **Commit Message Template:** `docs: add .env.example documenting required env vars`

### Task 5.3: Add CONTRIBUTING.md

- **Files to Create:** `CONTRIBUTING.md`
- **Implementation Steps:**
  1. Sections: Local Setup, Running Tests, Lint/Format, Conventional Commits, Branch Policy,
     PR Checklist, How to deploy, How to update the Apps Script caller.
  1. Local setup steps include: copy `.env.example` to `.env.local`, point
     `GOOGLE_APPLICATION_CREDENTIALS` at a local SA key file (gitignored), `npm ci`, `npm test`,
     `npm start`.
- **Commit Message Template:** `docs: add CONTRIBUTING.md with local-dev, test, and deploy steps`

### Task 5.4: Add docs/apps-script-oidc.md

- **Files to Create:** `docs/apps-script-oidc.md`
- **Implementation Steps:**
  1. Document, with copy-pasteable snippets:
     - Why the service is private.
     - How to grant the Apps Script's identity `roles/run.invoker`:

       ```bash
       gcloud run services add-iam-policy-binding dynamo-node-sheets-gpc \
         --region=us-central1 \
         --member="serviceAccount:APPS_SCRIPT_SA@PROJECT.iam.gserviceaccount.com" \
         --role="roles/run.invoker"
       ```

     - The Apps Script call pattern (this code lives in the Apps Script, not the repo):

       ```javascript
       const url = 'https://dynamo-node-sheets-gpc-XXXX.a.run.app/trigger';
       const token = ScriptApp.getIdentityToken();
       const res = UrlFetchApp.fetch(url, {
         method: 'post',
         headers: { Authorization: 'Bearer ' + token },
         muteHttpExceptions: true,
       });
       Logger.log(res.getResponseCode() + ' ' + res.getContentText());
       ```

     - Alternative: signed JWT via a dedicated SA the script impersonates (when
       `ScriptApp.getIdentityToken()` audience does not match).
     - Troubleshooting: 401 means missing/invalid token; 403 means token valid but identity
       lacks `run.invoker`.

  1. Note clearly that the Apps Script change itself is OUT of scope of this repo — this doc is
     the operator handoff.

- **Commit Message Template:** `docs: document Apps Script OIDC caller setup for private Cloud Run`

### Task 5.5: Update CHANGELOG.md

- **Files to Modify:** `CHANGELOG.md`
- **Implementation Steps:**
  1. Add a `[3.0.0] - 2026-04-07` entry describing the remediation: private Cloud Run, modular
     `src/`, server-rendered escaped dashboard, tests + CI gating, hardened Dockerfile, removed
     bootstrap artifacts.
  1. Mark the version bump as a breaking change (callers must now send OIDC tokens; `GET /` is
     no longer mutating; mutating endpoint is `POST /trigger`).
- **Verification Checklist:**
  - [x] Top of `CHANGELOG.md` matches `package.json` version (bump `package.json` to `3.0.0` in
        the same commit).
- **Commit Message Template:** `docs(changelog): add 3.0.0 remediation entry and bump version`

### Task 5.6: Add markdownlint + lychee CI

- **Files to Create:** `.markdownlint.json`, `.github/workflows/docs.yml`
- **Implementation Steps:**
  1. `.markdownlint.json`:

     ```json
     {
       "default": true,
       "MD013": false,
       "MD024": { "siblings_only": true },
       "MD033": false,
       "MD041": false
     }
     ```

  1. `.github/workflows/docs.yml`:

     ```yaml
     name: docs
     on:
       pull_request:
         paths:
           - '**/*.md'
           - '.github/workflows/docs.yml'
     jobs:
       lint:
         runs-on: ubuntu-latest
         steps:
           - uses: actions/checkout@v4
           - uses: DavidAnson/markdownlint-cli2-action@v16
             with:
               globs: '**/*.md'
       links:
         runs-on: ubuntu-latest
         steps:
           - uses: actions/checkout@v4
           - uses: lycheeverse/lychee-action@v2
             with:
               args: --no-progress --exclude-mail '**/*.md'
     ```

  1. Run `markdownlint-cli2 '**/*.md'` locally and fix every reported issue in the new docs.

- **Verification Checklist:**
  - [x] `markdownlint-cli2 '**/*.md'` exits 0 locally.
  - [x] `lychee '**/*.md'` exits 0 locally.
  - [x] PR triggers the `docs` workflow and both jobs pass.
- **Commit Message Template:** `ci(docs): gate PRs on markdownlint and lychee link checks`

## Phase Verification

- [x] All 6 task checklists pass.
- [x] Every drift item in `doc-audit.md` is resolved or explicitly removed (the stale files are
      already gone from Phase 1).
- [x] Eval Onboarding rises from 3 -> 9.
- [x] A new contributor with only `README.md` and `CONTRIBUTING.md` can clone, set env vars,
      and run `npm test` successfully.

PLAN_COMPLETE
