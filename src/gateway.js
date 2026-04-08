'use strict';

const crypto = require('node:crypto');
const { z } = require('zod');
const CONFIG = require('./config');
const { ItemSchema } = require('./sheets');
const { httpError } = require('./errors');

const ListSchema = z.array(ItemSchema);

/**
 * Fetch a URL with timeout and retry on 5xx / network failures.
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
async function fetchJson(url, init = {}) {
  const { fetchTimeoutMs, fetchMaxRetries } = CONFIG;
  let attempt = 0;

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
      const base = 200 * 2 ** attempt;
      const delay = base * (1 + Math.random() * 0.2);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * @typedef {{ TS: string, NAME: string, DAYS: string, DIET: string, PAY: string }} Item
 */

/**
 * Submit a single item to the upstream API gateway with an idempotency key.
 * @param {Item} item
 * @returns {Promise<{ idempotencyKey: string }>}
 */
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

/**
 * Fetch the list of items from the upstream API gateway.
 * @returns {Promise<Item[]>}
 */
async function listItems() {
  const res = await fetchJson(CONFIG.listUrl);
  if (!res.ok) throw httpError(502, 'upstream_list_failed');
  const json = await res.json();
  return ListSchema.parse(Array.isArray(json) ? json : []);
}

module.exports = { submitItem, listItems };
