# Phase 1: [HYGIENIST] Subtractive cleanup

## Phase Goal

Remove secret-bearing files, dead bootstrap artifacts, and the Dockerfile lines that bake
credentials into images. No new functionality. After this phase the repo is smaller and the
working tree contains nothing that should not be there.

**Success criteria:**

- `creds.json` no longer in working tree (it is gitignored, never committed).
- `Dockerfile` no longer copies `creds.json`.
- `.dockerignore` exists and excludes secrets, VCS, tests, and node_modules.
- `upload_csv.py`, `dynamo_sheets.csv`, `role-policy.json`, `trust-policy.json`, `altered.md`
  are deleted (dead bootstrap and stray blog post).
- `package.json` semver `"2.0.0."` is fixed to `"2.0.0"` and `name` updated per ADR-007.
- `node-fetch` removed from dependencies (replaced in Phase 2 with global `fetch`).
- The user has been instructed (in the task body) to rotate the GCP service-account key.

**Estimated tokens:** ~15k

## Prerequisites

- Phase 0 read.
- Working tree clean on `main`.

## Tasks

### Task 1.1: Add .dockerignore

- **Goal:** Prevent secrets, VCS, node_modules, and test files from entering Docker build context.
- **Files to Create:** `.dockerignore`
- **Implementation Steps:**
  1. Create `.dockerignore` at repo root with the following content:

     ```text
     node_modules
     npm-debug.log
     .git
     .github
     .gitignore
     .dockerignore
     creds.json
     *.csv
     *.md
     docs
     test
     tests
     **/*.test.js
     coverage
     .eslintrc*
     .prettierrc*
     .vscode
     .idea
     ```

- **Verification Checklist:**
  - [x] File exists.
  - [x] `docker build .` (after Phase 4 Dockerfile changes) does not include `creds.json` —
        verified with `docker build --no-cache --progress=plain .` and inspecting the
        `COPY . .` step output.
- **Testing Instructions:** Manual; no test infra yet.
- **Commit Message Template:**

  ```text
  chore(docker): add .dockerignore to keep secrets and VCS out of build context
  ```

### Task 1.2: Remove creds.json bake-in from Dockerfile

- **Goal:** Stop shipping the GCP service-account key inside the image.
- **Files to Modify:** `Dockerfile`
- **Prerequisites:** Task 1.1.
- **Implementation Steps:**
  1. Delete lines `Dockerfile:19-20`:

     ```text
     # Explicitly copy creds.json to ensure it's present if ignored by context
     COPY creds.json ./creds.json
     ```

  1. Leave the rest of the file alone — Phase 4 will harden it (Node 20, npm ci, USER, HEALTHCHECK).

- **Verification Checklist:**
  - [x] `grep -n creds.json Dockerfile` returns no matches.
- **Commit Message Template:**

  ```text
  fix(docker): stop baking creds.json into the image

  The service-account key was being copied directly into every built image,
  leaking the credential to anyone with image read access. Secret will be
  mounted via Secret Manager (see Phase 2 / cloudbuild.yaml).
  ```

### Task 1.3: Delete creds.json from the working tree

- **Goal:** Remove the on-disk key. It is gitignored so this is a working-tree-only delete.
- **Files to Delete:** `creds.json`
- **Prerequisites:** Task 1.2 (do not delete the file before the Dockerfile no longer references it
  in case the engineer rebuilds locally between commits).
- **Implementation Steps:**
  1. `rm /home/christophergalliart/projects/snow-node-sheets-gpc/creds.json`
  1. Confirm `git status` does not show `creds.json` as deleted (it is gitignored, so it should
     not appear).
- **Verification Checklist:**
  - [x] File no longer exists on disk.
  - [x] `git status` is clean of `creds.json`.
- **Out-of-band action for the user (NOT a code task):** Rotate the GCP service-account key in
  the Google Cloud console. The old key must be considered compromised because it shipped in
  prior Docker images.
- **Commit Message Template:** None — no tracked files change. Skip the commit for this task.

### Task 1.4: Delete dead bootstrap artifacts

- **Goal:** Remove files that have no live caller and bloat the repo.
- **Files to Delete:**
  - `upload_csv.py` (one-shot DynamoDB seed script, no `requirements.txt`, no caller).
  - `dynamo_sheets.csv` (input for the above).
  - `role-policy.json` (AWS IAM bootstrap, undocumented, not used by app).
  - `trust-policy.json` (AWS IAM bootstrap, undocumented, not used by app).
  - `altered.md` (a blog post that lives in repo root with no README explanation; code samples
    inside it are stale per `doc-audit.md`).
- **Implementation Steps:**
  1. `git rm upload_csv.py dynamo_sheets.csv role-policy.json trust-policy.json altered.md`
- **Verification Checklist:**
  - [x] None of the listed files exist.
  - [x] `grep -rE "upload_csv|dynamo_sheets\\.csv|role-policy|trust-policy|altered\\.md" .` returns
        no live references in code (matches inside `docs/` are fine).
- **Commit Message Template:**

  ```text
  chore: remove dead bootstrap artifacts and stale blog post

  upload_csv.py, dynamo_sheets.csv, role-policy.json, trust-policy.json, and
  altered.md are not referenced by the running service. They were bootstrap
  scaffolding from the AWS migration and have no remaining callers.
  ```

### Task 1.5: Fix package.json semver, name, and remove node-fetch

- **Goal:** Quick-win hygiene fixes called out by every audit document.
- **Files to Modify:** `package.json`
- **Implementation Steps:**
  1. Set `"version"` to `"2.0.0"` (remove trailing dot).
  1. Set `"name"` to `"dynamo-node-sheets-gpc"` (per ADR-007).
  1. Set `"description"` to `"Google Sheets to DynamoDB connector running on Cloud Run."`
  1. Remove the `"node-fetch"` line from `"dependencies"`.
  1. Run `npm install` to refresh `package-lock.json` (this will drop `node-fetch` from the
     lockfile).
- **Verification Checklist:**
  - [x] `node -e "console.log(require('./package.json').version)"` prints `2.0.0`.
  - [x] `grep node-fetch package.json package-lock.json` returns no matches.
- **Commit Message Template:**

  ```text
  chore(deps): fix package metadata and drop node-fetch

  - version: "2.0.0." -> "2.0.0" (was invalid semver)
  - name: align with the deployed Cloud Run service
  - description: reflect the post-Snowflake DynamoDB architecture
  - drop node-fetch (Phase 2 switches to the built-in global fetch)
  ```

## Phase Verification

- [x] All five task verification checklists pass.
- [x] `git status` shows only the expected file deletions and modifications.
- [x] `npm ci` runs without error.
- [x] No CRITICAL items 1, 5, 6, or LOW items 1, 4 from `health-audit.md` remain in the working
      tree (they are addressed by this phase).
