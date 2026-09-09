'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { PROJECT_ROOT, readEnv, resolveDataDir } = require('../src/config/env');

test('resolveDataDir resolve caminho relativo a partir da raiz do projeto', () => {
  assert.equal(resolveDataDir('data'), path.join(PROJECT_ROOT, 'data'));
  assert.equal(resolveDataDir('./persist'), path.join(PROJECT_ROOT, 'persist'));
});

test('resolveDataDir mantém caminho absoluto', () => {
  const absolute = path.resolve('/tmp/ticket-bot-data');
  assert.equal(resolveDataDir(absolute), absolute);
});

test('readEnv preserva precedência do objeto de ambiente e parseia domínios', () => {
  const config = readEnv({
    DISCORD_TOKEN: 'token-a',
    DISCORD_CLIENT_ID: 'client-b',
    DISCORD_GUILD_ID: '123',
    DATA_DIR: './storage',
    MAILCOW_ALLOWED_DOMAINS: 'A.com, b.com ,a.com',
  });

  assert.equal(config.token, 'token-a');
  assert.equal(config.clientId, 'client-b');
  assert.equal(config.guildId, '123');
  assert.equal(config.dataDir, path.join(PROJECT_ROOT, 'storage'));
  assert.deepEqual(config.mailcowAllowedDomains, ['a.com', 'b.com']);
});
