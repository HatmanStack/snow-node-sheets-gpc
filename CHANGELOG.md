# Changelog

All notable changes to this project will be documented in this file.

## [3.0.0] - 2026-04-07

Audit remediation. **Breaking change**: callers must now send an OIDC bearer token; the
mutating endpoint moved from `GET /` to `POST /trigger`; `GET /` is now a side-effect-free
health blurb.

### Added

- Private Cloud Run deployment. `--allow-unauthenticated` removed; access gated by
  `roles/run.invoker` and validated by Cloud Run before requests reach the app.
- Modular `src/` layout (`config`, `sheets`, `gateway`, `validate`, `routes/`, `server`).
- Server-rendered `/dashboard` with HTML escaping and a strict Content-Security-Policy.
- `zod` boundary validation for the sheet row and the API Gateway list response.
- `node:test` + `supertest` suite gated at 70% line coverage on `src/`.
- ESLint, Prettier, JSDoc typecheck (`tsc --noEmit`), husky `pre-commit`, and a CI
  workflow that gates PRs on lint, format, typecheck, and coverage.
- `markdownlint-cli2` and `lychee` link-check CI for all `*.md` files.
- `.env.example`, `CONTRIBUTING.md`, and `docs/apps-script-oidc.md`.
- Hardened Dockerfile: `node:20-alpine`, `npm ci --omit=dev`, non-root `USER node`,
  `HEALTHCHECK` against `/healthz`.

### Changed

- Route surface: `POST /trigger`, `GET /data`, `GET /dashboard`, `GET /healthz`,
  `GET /readyz`, `GET /` (health blurb).
- Replaced `node-fetch` with the Node 20 global `fetch` plus `AbortController` timeouts
  and bounded retries.
- Service-account key delivery moved out of the Docker image and onto Secret Manager via
  `GOOGLE_APPLICATION_CREDENTIALS`.
- `package.json` `engines.node` pinned to `20.x`; package name reconciled to
  `dynamo-node-sheets-gpc` to match the Cloud Run service.

### Removed

- The on-disk service-account key file from the working tree and the Docker image.
- Bootstrap artifacts: `upload_csv.py`, `dynamo_sheets.csv`, `role-policy.json`,
  `trust-policy.json`, `altered.md`.
- All references to the prior data backend, Node 12, and Node 16 from documentation.

### Security

- Cloud Run lockdown closes the previously public mutating `GET /`, the unauthenticated
  DynamoDB scan via `GET /data`, and the previously XSS-vulnerable dashboard.
- XSS in `/dashboard` fixed via output escaping even though IAM now blocks anonymous
  access (defense in depth).
- The previously on-disk service-account key must be considered compromised and rotated.

## [2.1.0] - 2026-02-27

### Added

- AWS DynamoDB integration replacing the prior storage backend.
- AWS API Gateway bridge for SDK-free DynamoDB writes from Node.js.
- `/dashboard` route to visualize DynamoDB entries.
- Auto-sorting of dashboard entries by timestamp (descending).
- Detailed debug logging for API Gateway calls and error handling.
- Apache 2.0 license.

### Changed

- Architecture moved from a direct database connector to an SDK-free, API-driven design.
- Infrastructure table name set to `dynamo_sheets`.

### Fixed

- Resolved `ENOENT` error for the credentials file in the Docker build.
- Resolved API Gateway output mapping errors.

## [2.0.0] - Pre-Migration

- Original implementation.
