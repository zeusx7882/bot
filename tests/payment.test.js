'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmountInput, extractPaymentUrl } = require('../src/domain/payment');
const { ValidationError } = require('../src/domain/validation');

test('parseAmountInput valida unidade minor (inteiro)', () => {
  const parsed = parseAmountInput('1500', { unit: 'minor', majorDecimals: 2 });
  assert.equal(parsed.amountForApi, 1500);
  assert.throws(() => parseAmountInput('15.00', { unit: 'minor', majorDecimals: 2 }), ValidationError);
});

test('parseAmountInput valida unidade major com casas configuradas', () => {
  const parsed = parseAmountInput('15.5', { unit: 'major', majorDecimals: 2 });
  assert.equal(parsed.normalized, '15.50');
  assert.throws(() => parseAmountInput('15.555', { unit: 'major', majorDecimals: 2 }), ValidationError);
});

test('extractPaymentUrl aceita apenas https válido', () => {
  const ok = extractPaymentUrl({ payment: { gateway: { data: { paymentLink: 'https://pay.example/a' } } } });
  const bad = extractPaymentUrl({ payment: { gateway: { data: { paymentLink: 'http://pay.example/a' } } } });
  assert.equal(ok, 'https://pay.example/a');
  assert.equal(bad, null);
});
