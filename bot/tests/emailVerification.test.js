'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseCredentialInput,
  enforceAllowedDomain,
  sanitizeEmailText,
  extractHttpLinks,
} = require('../src/domain/emailVerification');
const { ValidationError } = require('../src/domain/validation');

test('parseCredentialInput separa email e senha e descarta token extra', () => {
  const parsed = parseCredentialInput('usuario@example.test:senha-ficticia:campo-ignorado');
  assert.deepEqual(parsed, {
    email: 'usuario@example.test',
    password: 'senha-ficticia',
  });
});

test('parseCredentialInput preserva espaços/símbolos na senha e rejeita multiline', () => {
  const parsed = parseCredentialInput('usuario@example.test:  senha com $ e espaço  ');
  assert.equal(parsed.password, '  senha com $ e espaço  ');

  assert.throws(() => parseCredentialInput('a@example.test:abc\n123'), ValidationError);
});

test('enforceAllowedDomain valida allowlist', () => {
  assert.doesNotThrow(() => enforceAllowedDomain('user@dominio.test', ['dominio.test']));
  assert.throws(() => enforceAllowedDomain('user@outro.test', ['dominio.test']), ValidationError);
});

test('sanitizeEmailText escapa markdown e extractHttpLinks limita links', () => {
  const sanitized = sanitizeEmailText('**texto**\nhttps://a.test/1 https://a.test/2');
  assert.match(sanitized.text, /\\\*\\\*texto\\\*\\\*/);

  const links = extractHttpLinks('https://a.test/1 https://b.test/2');
  assert.deepEqual(links, ['https://a.test/1', 'https://b.test/2']);
});
