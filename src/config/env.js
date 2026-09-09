'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config();

function parseAllowedDomains(raw) {
  if (!raw || !raw.trim()) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

/**
 * Configuração de ambiente centralizada. Falha rápido (fail-fast) se variáveis
 * obrigatórias estiverem ausentes, exceto quando explicitamente carregado em
 * modo de teste (`NODE_ENV=test`), onde os valores podem ser sobrescritos.
 */
function readEnv(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR && env.DATA_DIR.trim() ? env.DATA_DIR.trim() : './data');
  const parsedPort = Number.parseInt(env.MAILCOW_IMAP_PORT || '993', 10);

  return {
    token: env.DISCORD_TOKEN || '',
    clientId: env.DISCORD_CLIENT_ID || '',
    guildId: env.DISCORD_GUILD_ID && env.DISCORD_GUILD_ID.trim() ? env.DISCORD_GUILD_ID.trim() : null,
    dataDir,
    dbPath: path.join(dataDir, 'ticket-bot.sqlite'),
    nodeEnv: env.NODE_ENV || 'production',
    mailcowImapHost: env.MAILCOW_IMAP_HOST && env.MAILCOW_IMAP_HOST.trim() ? env.MAILCOW_IMAP_HOST.trim() : '',
    mailcowImapPort: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 993,
    mailcowAllowedDomains: parseAllowedDomains(env.MAILCOW_ALLOWED_DOMAINS || ''),
    mailcowImapAuthTimeoutMs: 12000,
  };
}

function assertRuntimeConfig(config) {
  const missing = [];
  if (!config.token) missing.push('DISCORD_TOKEN');
  if (!config.clientId) missing.push('DISCORD_CLIENT_ID');
  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}. ` +
        'Copie .env.example para .env e preencha os valores.'
    );
  }
}

module.exports = { readEnv, assertRuntimeConfig };
