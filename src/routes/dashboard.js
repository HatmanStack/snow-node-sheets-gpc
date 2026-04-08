'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { listItems } = require('../gateway');
const { htmlEscape } = require('../errors');

const TEMPLATE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'dashboard.html'),
  'utf8',
);

const router = express.Router();

router.get('/dashboard', async (_req, res, next) => {
  try {
    const items = await listItems();
    items.sort((a, b) => new Date(b.TS).getTime() - new Date(a.TS).getTime());
    const rows = items
      .map(
        (i) => `<tr>
        <td>${htmlEscape(i.TS)}</td>
        <td>${htmlEscape(i.NAME)}</td>
        <td>${htmlEscape(i.DAYS)}</td>
        <td>${htmlEscape(i.DIET)}</td>
        <td>${htmlEscape(i.PAY)}</td>
      </tr>`,
      )
      .join('');
    res.set(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'",
    );
    res.set('X-Content-Type-Options', 'nosniff');
    res.type('html').send(TEMPLATE.replace('<!--ROWS-->', rows));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
