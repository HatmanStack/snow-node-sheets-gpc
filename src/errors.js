'use strict';

/**
 * @typedef {Error & { status: number, code: string }} HttpError
 */

/**
 * Build an Error decorated with HTTP status and a stable error code.
 * @param {number} status
 * @param {string} code
 * @param {string} [message]
 * @returns {HttpError}
 */
function httpError(status, code, message = code) {
  const e = /** @type {HttpError} */ (new Error(message));
  e.status = status;
  e.code = code;
  return e;
}

/**
 * Escape a value for safe inclusion in HTML.
 * @param {unknown} s
 * @returns {string}
 */
function htmlEscape(s) {
  /** @type {Record<string, string>} */
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

module.exports = { httpError, htmlEscape };
