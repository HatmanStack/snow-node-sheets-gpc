'use strict';

require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const { ItemSchema } = require('../src/sheets');

test('ItemSchema accepts valid item', () => {
  const ok = ItemSchema.parse({
    TS: '2024-01-01T00:00:00Z',
    NAME: 'Alice',
    DAYS: '5',
    DIET: 'none',
    PAY: '100',
  });
  assert.equal(ok.NAME, 'Alice');
});

test('ItemSchema rejects empty TS', () => {
  assert.throws(() => ItemSchema.parse({ TS: '', NAME: 'A', DAYS: '1', DIET: '', PAY: '' }));
});

test('ItemSchema rejects oversized NAME', () => {
  assert.throws(() =>
    ItemSchema.parse({
      TS: 't',
      NAME: 'x'.repeat(201),
      DAYS: '1',
      DIET: '',
      PAY: '',
    }),
  );
});
