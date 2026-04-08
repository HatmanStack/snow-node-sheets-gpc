# Apps Script OIDC Caller Setup

This document is the operator handoff for wiring the Google Apps Script caller to the private
Cloud Run service `dynamo-node-sheets-gpc`. The Apps Script itself lives outside this repo;
the changes described here are made in the Apps Script editor, not in this codebase.

## Why the Service is Private

The Cloud Run service is deployed without `--allow-unauthenticated`. Cloud Run rejects any
request that does not present a valid Google-issued OIDC ID token whose identity holds
`roles/run.invoker` on the service. This is the primary security control: the application
does not need to validate tokens itself.

## Grant the Apps Script Identity `roles/run.invoker`

Pick the service account that the Apps Script runs as (or a dedicated SA it can impersonate)
and bind the invoker role on the Cloud Run service.

```bash
gcloud run services add-iam-policy-binding dynamo-node-sheets-gpc \
  --region=us-central1 \
  --member="serviceAccount:APPS_SCRIPT_SA@PROJECT.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

## Apps Script Call Pattern

This code lives in the Apps Script project, not in this repo.

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

`ScriptApp.getIdentityToken()` returns an OIDC ID token bound to the Apps Script's effective
identity. Cloud Run validates the token's signature, audience, and the caller's IAM grant
before forwarding the request to the container.

## Alternative: Signed JWT From a Dedicated Service Account

When `ScriptApp.getIdentityToken()` produces a token whose audience does not match the
Cloud Run URL, mint an ID token explicitly via a dedicated service account that the script
impersonates.

```javascript
function getIdToken(audience) {
  const sa = 'invoker-sa@PROJECT.iam.gserviceaccount.com';
  const url =
    'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' +
    sa +
    ':generateIdToken';
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ audience: audience, includeEmail: true }),
    muteHttpExceptions: true,
  });
  return JSON.parse(res.getContentText()).token;
}
```

The Apps Script's primary identity needs `roles/iam.serviceAccountTokenCreator` on
`invoker-sa`, and `invoker-sa` needs `roles/run.invoker` on the Cloud Run service.

## Troubleshooting

| Status | Meaning                                                                   |
| ------ | ------------------------------------------------------------------------- |
| 401    | Missing or invalid OIDC token. Check `Authorization` header and audience. |
| 403    | Token is valid but the identity lacks `roles/run.invoker` on the service. |
| 404    | Wrong URL. Confirm the Cloud Run revision URL and the route path.         |
| 5xx    | Application error. Check Cloud Run logs.                                  |

## Scope

The Apps Script change itself is **out of scope** for this repo. This document exists so the
operator who owns the Apps Script project can implement the caller-side changes that the
Cloud Run lockdown requires.
