'use strict';

function httpError(status, code, message = code) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

function htmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

module.exports = { httpError, htmlEscape };
