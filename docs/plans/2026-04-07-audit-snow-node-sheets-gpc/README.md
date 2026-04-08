# Audit Remediation Plan: snow-node-sheets-gpc

## Overview

Unified remediation for the `snow-node-sheets-gpc` Cloud Run service consolidating findings from
three audits in this directory: `health-audit.md`, `eval.md`, and `doc-audit.md`.

The service is small (one ~174 LOC `index.js`, a Dockerfile, and a `cloudbuild.yaml`) but has
critical security, hygiene, and documentation issues. The primary security mitigation — per the
mandatory user directive at the top of `health-audit.md` — is to lock down Cloud Run by removing
`--allow-unauthenticated` and require OIDC bearer tokens from the Google Apps Script caller.

## Prerequisites

1. Local clone of `/home/christophergalliart/projects/snow-node-sheets-gpc` on `main`.
1. `gcloud` CLI authenticated to the GCP project that owns Cloud Run service `dynamo-node-sheets-gpc`.
1. IAM permission to grant `roles/run.invoker` and to deploy via Cloud Build.
1. Ability to rotate the GCP service-account key referenced by `creds.json` (the existing key on
   disk MUST be considered compromised because it was previously baked into Docker images via
   `Dockerfile:20`).
1. Node.js 20.x LTS available locally (the plan pins the runtime to Node 20).
1. Read access to the Google Apps Script that calls this service (so the Apps Script can later be
   updated to send OIDC tokens — that change is documented here but lives outside this repo).

## Phase Summary

| Phase | Tag            | Title                                                              | Est Tokens |
| ----- | -------------- | ------------------------------------------------------------------ | ---------- |
| 0     | n/a            | Architecture, Conventions, ADRs                                    | n/a        |
| 1     | [HYGIENIST]    | Subtractive cleanup: secrets, dead artifacts, Dockerfile           | ~15k       |
| 2     | [IMPLEMENTER]  | Security fixes: Cloud Run OIDC lockdown, XSS, validation, timeouts | ~35k       |
| 3     | [IMPLEMENTER]  | Modularize index.js into src/ + extract dashboard                  | ~30k       |
| 4     | [FORTIFIER]    | Tooling: lint, format, tests, CI gating, Dockerfile hardening      | ~30k       |
| 5     | [DOC-ENGINEER] | Documentation rewrite + markdownlint/lychee CI                     | ~20k       |

## Sequencing Rationale

Hygiene first removes the secret-bearing files from the working tree so subsequent work happens
on a clean slate. Security implementer work runs next because the Cloud Run lockdown is the
single highest-impact mitigation. Modularization follows so tests can target real modules rather
than a monolith. Fortifier adds the test/lint/CI scaffolding once there is something to test.
Documentation runs last so it describes the final shipped state, not a moving target.

## Audit Source Map

- `health-audit.md` — 4 critical / 6 high / 7 medium / 5 low debt findings + USER REMEDIATION DIRECTIVE.
- `eval.md` — Architecture 5/10, Code Quality 6/10, Defensiveness 2/10, Test Value 1/10.
- `doc-audit.md` — 6 drift / 4 gap / 2 stale findings.
