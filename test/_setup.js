'use strict';

// Default env for tests that load modules requiring config.
process.env.SPREADSHEET_ID = process.env.SPREADSHEET_ID || 'test-sheet';
process.env.API_GATEWAY_SUBMIT_URL =
  process.env.API_GATEWAY_SUBMIT_URL || 'https://example.test/submit';
process.env.API_GATEWAY_LIST_URL = process.env.API_GATEWAY_LIST_URL || 'https://example.test/list';
process.env.FETCH_TIMEOUT_MS = process.env.FETCH_TIMEOUT_MS || '50';
process.env.FETCH_MAX_RETRIES = process.env.FETCH_MAX_RETRIES || '2';
