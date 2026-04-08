'use strict';

const express = require('express');
const { getLatestRow } = require('../sheets');
const { submitItem } = require('../gateway');

const router = express.Router();

router.post('/trigger', async (_req, res, next) => {
  try {
    const item = await getLatestRow();
    if (!item) return res.status(204).end();
    const out = await submitItem(item);
    res.json({ ok: true, item, idempotencyKey: out.idempotencyKey });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
