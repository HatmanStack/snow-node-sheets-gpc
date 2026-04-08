'use strict';

const { google } = require('googleapis');
const { z } = require('zod');
const CONFIG = require('./config');

const ItemSchema = z.object({
  TS: z.string().min(1).max(64),
  NAME: z.string().min(1).max(200),
  DAYS: z.string().min(1).max(20),
  DIET: z.string().min(0).max(500),
  PAY: z.string().min(0).max(50),
});

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
google.options({ auth });
const sheets = google.sheets('v4');

async function getLatestRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.spreadsheetId,
    range: CONFIG.sheetRange,
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return ItemSchema.parse({
    TS: String(r[0] ?? ''),
    NAME: String(r[1] ?? ''),
    DAYS: String(r[2] ?? ''),
    DIET: String(r[3] ?? ''),
    PAY: String(r[4] ?? ''),
  });
}

module.exports = { getLatestRow, ItemSchema };
