'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const validation = require('../src/domain/validation');

test('validatePanelTitle rejeita vazio e aplica limite', () => {
  assert.throws(() => validation.validatePanelTitle('   '), validation.ValidationError);
  assert.throws(() => validation.validatePanelTitle('a'.repeat(300)), validation.ValidationError);
  assert.equal(validation.validatePanelTitle('  Meu título  '), 'Meu título');
});

test('validatePanelDescription aplica limite de 4000 caracteres', () => {
  assert.throws(() => validation.validatePanelDescription('a'.repeat(4001)), validation.ValidationError);
  assert.equal(validation.validatePanelDescription('ok').length, 2);
});

test('validateOptionLabel aplica limite de 100 caracteres', () => {
  assert.throws(() => validation.validateOptionLabel(''), validation.ValidationError);
  assert.throws(() => validation.validateOptionLabel('a'.repeat(101)), validation.ValidationError);
  assert.equal(validation.validateOptionLabel('Suporte'), 'Suporte');
});

test('validateOptionDescription permite vazio/nulo', () => {
  assert.equal(validation.validateOptionDescription(undefined), null);
  assert.equal(validation.validateOptionDescription(''), null);
  assert.equal(validation.validateOptionDescription('  '), null);
  assert.equal(validation.validateOptionDescription(' abc '), 'abc');
});

test('validateEmoji aceita emoji unicode e customizado, rejeita texto comum', () => {
  assert.equal(validation.validateEmoji(''), null);
  assert.equal(validation.validateEmoji('🎫'), '🎫');
  assert.equal(validation.validateEmoji('<:custom:123456789012345678>'), '<:custom:123456789012345678>');
  assert.throws(() => validation.validateEmoji('nao-emoji-texto'), validation.ValidationError);
});

test('validateImageUrl valida http(s) e rejeita credenciais/protocolo inválido', () => {
  assert.equal(validation.validateImageUrl('https://exemplo.com/a.png'), 'https://exemplo.com/a.png');
  assert.equal(validation.validateImageUrl('exemplo.com/a.png'), 'https://exemplo.com/a.png');
  assert.throws(() => validation.validateImageUrl('ftp://exemplo.com/a.png'), validation.ValidationError);
  assert.throws(() => validation.validateImageUrl('user:pass@exemplo.com/a.png'), validation.ValidationError);
  assert.throws(() => validation.validateImageUrl('   '), validation.ValidationError);
});

test('validateDomain normaliza e valida a URL sem fazer requisições de rede', () => {
  assert.equal(validation.validateDomain('meusite.com'), 'https://meusite.com/');
  assert.equal(validation.validateDomain('http://meusite.com'), 'http://meusite.com/');
  assert.throws(() => validation.validateDomain('javascript:alert(1)'), validation.ValidationError);
  assert.throws(() => validation.validateDomain('user:pass@meusite.com'), validation.ValidationError);
});
