# dynamo-node-sheets-gpc

Private Cloud Run service that reads the latest row from a Google Sheet and forwards it to AWS
DynamoDB through an API Gateway bridge. Invoked by a Google Apps Script using OIDC bearer tokens.

## Architecture

```text
+----------------+      +---------------------+      +------------------+      +-----------+
| Google Form    | ---> | Google Apps Script  | ---> | Cloud Run        | ---> | API       |
| (sheet writer) |      | (OIDC ID token)     |      | dynamo-node-     |      | Gateway   |
+----------------+      +---------------------+      | sheets-gpc       |      | (AWS)     |
                                                     +------------------+      +-----------+
                                                              |                      |
                                                              v                      v
                                                     +------------------+      +-----------+
                                                     | Google Sheets    |      | DynamoDB  |
                                                     | (read latest row)|      | dynamo_   |
                                                     +------------------+      | sheets    |
                                                                               +-----------+
```

The Cloud Run service is private. Callers must present `Authorization: Bearer <OIDC token>`;
Cloud Run validates the token before any request reaches the app.

## Routes

| Method | Path         | Auth | Description                                               |
| ------ | ------------ | ---- | --------------------------------------------------------- |
| GET    | `/`          | OIDC | Health blurb. No side effects.                            |
| GET    | `/healthz`   | OIDC | Liveness probe.                                           |
| GET    | `/readyz`    | OIDC | Readiness probe.                                          |
| POST   | `/trigger`   | OIDC | Read latest sheet row, write to DynamoDB via API Gateway. |
| GET    | `/data`      | OIDC | List DynamoDB items via API Gateway (zod-validated).      |
| GET    | `/dashboard` | OIDC | Server-rendered HTML table (escaped, CSP set).            |

## Environment Variables

| Name                             | Required | Default | Description                                    |
| -------------------------------- | -------- | ------- | ---------------------------------------------- |
| `PORT`                           | no       | `8080`  | HTTP port the server binds to.                 |
| `SPREADSHEET_ID`                 | yes      | -       | Google Sheets spreadsheet ID.                  |
| `SHEET_RANGE`                    | no       | `A2:E2` | A1 range read for the latest row.              |
| `API_GATEWAY_SUBMIT_URL`         | yes      | -       | API Gateway endpoint for `PutItem`.            |
| `API_GATEWAY_LIST_URL`           | yes      | -       | API Gateway endpoint for list/scan.            |
| `FETCH_TIMEOUT_MS`               | no       | `10000` | Per-request timeout for outbound `fetch`.      |
| `FETCH_MAX_RETRIES`              | no       | `3`     | Retry attempts for transient gateway failures. |
| `GOOGLE_APPLICATION_CREDENTIALS` | yes      | -       | Path to the GCP service-account key file.      |

In Cloud Run the credentials file is mounted from Secret Manager via `--set-secrets`; locally
it points at a gitignored key file (see `CONTRIBUTING.md`).

## Local Development

```bash
cp .env.example .env.local
# edit .env.local with your values; point GOOGLE_APPLICATION_CREDENTIALS at a local key file
npm ci
npm test
npm start
```

See `CONTRIBUTING.md` for the full workflow.

## Testing

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:cov
```

`test:cov` enforces a 70% line coverage gate on `src/`.

## Deployment

Continuous deployment runs through Cloud Build (`cloudbuild.yaml`). Every push to `main` builds
the container and rolls it out to the private Cloud Run service `dynamo-node-sheets-gpc`. The
deploy step does not pass `--allow-unauthenticated`; access is gated by IAM.

## Authentication (OIDC)

The service requires `Authorization: Bearer <OIDC ID token>` on every request. Cloud Run
validates the token; the application does not re-validate it.

Quick check from a workstation:

```bash
TOKEN=$(gcloud auth print-identity-token)
curl -H "Authorization: Bearer $TOKEN" \
  https://dynamo-node-sheets-gpc-XXXX.a.run.app/healthz
```

For the Apps Script caller setup, including IAM bindings and the
`ScriptApp.getIdentityToken()` snippet, see [`docs/apps-script-oidc.md`](docs/apps-script-oidc.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
