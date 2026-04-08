'use strict';

const crypto = require('node:crypto');
const { z } = require('zod');
const CONFIG = require('./config');
const { ItemSchema } = require('./sheets');
const { httpError } = require('./errors');

const ListSchema = z.array(ItemSchema);

async function fetchJson(url, init = {}) {
  const { fetchTimeoutMs, fetchMaxRetries } = CONFIG;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), fetchTimeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      if (res.status >= 500 && attempt < fetchMaxRetries) {
        throw new Error(`upstream ${res.status}`);
      }
      return res;
    } catch (err) {
      if (attempt >= fetchMaxRetries) throw err;
      const delay = 200 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function submitItem(item) {
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(item.TS + '|' + item.NAME)
    .digest('hex');
  const res = await fetchJson(CONFIG.submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw httpError(502, 'upstream_submit_failed');
  return { idempotencyKey };
}

async function listItems() {
  const res = await fetchJson(CONFIG.listUrl);
  if (!res.ok) throw httpError(502, 'upstream_list_failed');
  const json = await res.json();
  return ListSchema.parse(Array.isArray(json) ? json : []);
}

module.exports = { submitItem, listItems };
