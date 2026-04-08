# Contributing

## Local Setup

1. Clone the repo and `cd` into it.
1. Copy the environment template and edit values.

   ```bash
   cp .env.example .env.local
   ```

1. Point `GOOGLE_APPLICATION_CREDENTIALS` in `.env.local` at a local GCP service-account key
   file. Keep the key file outside the repo or in a gitignored path. Never commit it.
1. Install dependencies with the locked versions.

   ```bash
   npm ci
   ```

1. Run the test suite.

   ```bash
   npm test
   ```

1. Start the server.

   ```bash
   npm start
   ```

## Running Tests

```bash
npm test            # node:test runner
npm run test:cov    # with c8 coverage gate (>= 70% lines on src/)
```

## Lint and Format

```bash
npm run lint
npm run format:check
npm run format       # write formatting fixes
npm run typecheck    # tsc --noEmit against JSDoc
```

A husky pre-commit hook runs `lint-staged` and the test suite. Do not bypass it with
`--no-verify` unless you are mid-rebase and the hook is failing for unrelated reasons.

## Conventional Commits

All commits follow [Conventional Commits](https://www.conventionalcommits.org/). Allowed
types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `build`, `perf`, `revert`.
Each task ships as a single atomic commit.

## Branch Policy

Trunk-based on `main`. Create a feature branch per change, squash-merge via PR. Force-pushing
to `main` is forbidden.

## PR Checklist

- [ ] `npm run lint` clean
- [ ] `npm run format:check` clean
- [ ] `npm run typecheck` clean
- [ ] `npm run test:cov` passes the 70% gate
- [ ] Conventional Commit subject under 72 chars
- [ ] Docs updated if behavior, routes, or env vars changed
- [ ] No secrets, key files, or `.env*` files staged

## How to Deploy

Deployment is automatic. Pushing to `main` triggers Cloud Build (`cloudbuild.yaml`), which
builds the image and rolls out to the private Cloud Run service `dynamo-node-sheets-gpc`. The
service is deployed without `--allow-unauthenticated`; access is gated by IAM.

To deploy manually from a workstation:

```bash
gcloud builds submit
```

## How to Update the Apps Script Caller

The Apps Script lives outside this repo. To wire it to the private Cloud Run service it must
attach an OIDC ID token on every request. The full operator handoff — IAM bindings, code
snippet, and troubleshooting — is in [`docs/apps-script-oidc.md`](docs/apps-script-oidc.md).
