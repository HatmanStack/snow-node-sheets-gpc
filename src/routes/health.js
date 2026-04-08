'use strict';

const express = require('express');

const router = express.Router();

router.get('/healthz', (_req, res) => res.json({ ok: true }));
// NOTE: /readyz is a shallow probe — it does not verify Sheets or API Gateway
// reachability. Cloud Run will route traffic as soon as the process is up.
router.get('/readyz', (_req, res) => res.json({ ok: true }));
router.get('/', (_req, res) => res.json({ service: 'dynamo-node-sheets-gpc', ok: true }));

module.exports = router;
