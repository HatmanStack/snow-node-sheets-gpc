'use strict';

const express = require('express');
const { listItems } = require('../gateway');

const router = express.Router();

router.get('/data', async (_req, res, next) => {
  try {
    const items = await listItems();
    res.json(items);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
