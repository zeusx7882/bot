'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { parseAmountInput, extractPaymentUrl, extractPaymentCode } = require('../src/domain/payment');
const { ValidationError } = require('../src/domain/validation');
const { buildPlainCopyReply } = require('../src/utils/plainReplies');

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
  const withCreds = extractPaymentUrl({ payment: { gateway: { data: { paymentLink: 'https://user@pay.example/a' } } } });
  assert.equal(ok, 'https://pay.example/a');
  assert.equal(bad, null);
  assert.equal(withCreds, null);
});

test('extractPaymentCode preserva o valor bruto retornado pela API', () => {
  assert.equal(
    extractPaymentCode({ payment: { gateway: { data: { code: '000201010212ABC' } } } }),
    '000201010212ABC'
  );
  assert.equal(extractPaymentCode({ payment: { gateway: { data: { code: '' } } } }), null);
});

test('buildPlainCopyReply usa mensagem efêmera simples e fallback para arquivo sem truncar', () => {
  const inline = buildPlainCopyReply('abc123', {
    fileName: 'codigo.txt',
    overflowMessage: 'overflow',
  });
  assert.equal(inline.content, 'abc123');
  assert.equal(inline.components, undefined);
  assert.ok(inline.flags & MessageFlags.Ephemeral);
  assert.ok(inline.flags & MessageFlags.SuppressEmbeds);

  const longValue = 'x'.repeat(2100);
  const fallback = buildPlainCopyReply(longValue, {
    fileName: 'codigo.txt',
    overflowMessage: 'abra o arquivo',
  });
  assert.equal(fallback.content, 'abra o arquivo');
  assert.equal(fallback.files.length, 1);
});
