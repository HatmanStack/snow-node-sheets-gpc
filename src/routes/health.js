'use strict';

const express = require('express');

const router = express.Router();

router.get('/healthz', (_req, res) => res.json({ ok: true }));
router.get('/readyz', (_req, res) => res.json({ ok: true }));
router.get('/', (_req, res) => res.json({ service: 'dynamo-node-sheets-gpc', ok: true }));

module.exports = router;
