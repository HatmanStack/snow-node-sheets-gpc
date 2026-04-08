'use strict';

/**
 * Read a required env var or throw a startup error.
 * @param {string} name
 * @returns {string}
 */
function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const CONFIG = {
  port: Number(process.env.PORT || 8080),
  spreadsheetId: required('SPREADSHEET_ID'),
  sheetRange: process.env.SHEET_RANGE || 'A2:E2',
  submitUrl: required('API_GATEWAY_SUBMIT_URL'),
  listUrl: required('API_GATEWAY_LIST_URL'),
  fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS || 10_000),
  fetchMaxRetries: Number(process.env.FETCH_MAX_RETRIES || 3),
};

module.exports = Object.freeze(CONFIG);
