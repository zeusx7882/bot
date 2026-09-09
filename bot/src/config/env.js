'use strict';

const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
loadDotEnv();

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
  const dataDir = resolveDataDir(env.DATA_DIR, PROJECT_ROOT);
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
    sharpifyBaseUrl: env.SHARPIFY_BASE_URL && env.SHARPIFY_BASE_URL.trim() ? env.SHARPIFY_BASE_URL.trim() : '',
    sharpifyClientId: env.SHARPIFY_CLIENT_ID && env.SHARPIFY_CLIENT_ID.trim() ? env.SHARPIFY_CLIENT_ID.trim() : '',
    sharpifyClientSecret:
      env.SHARPIFY_CLIENT_SECRET && env.SHARPIFY_CLIENT_SECRET.trim() ? env.SHARPIFY_CLIENT_SECRET.trim() : '',
    sharpifyAmountUnit: env.SHARPIFY_AMOUNT_UNIT && env.SHARPIFY_AMOUNT_UNIT.trim()
      ? env.SHARPIFY_AMOUNT_UNIT.trim().toLowerCase()
      : '',
    sharpifyCurrency: env.SHARPIFY_CURRENCY && env.SHARPIFY_CURRENCY.trim() ? env.SHARPIFY_CURRENCY.trim() : '',
    sharpifyMajorDecimals: Number.parseInt(env.SHARPIFY_MAJOR_DECIMALS || '2', 10),
    sharpifyTimeoutMs: Number.parseInt(env.SHARPIFY_TIMEOUT_MS || '10000', 10),
    sharpifyEnabled: Boolean(
      env.SHARPIFY_BASE_URL &&
        env.SHARPIFY_CLIENT_ID &&
        env.SHARPIFY_CLIENT_SECRET &&
        env.SHARPIFY_AMOUNT_UNIT &&
        env.SHARPIFY_CURRENCY
    ),
  };
}

function resolveDataDir(rawDataDir, baseDir = PROJECT_ROOT) {
  const fallback = 'data';
  const value = rawDataDir && rawDataDir.trim() ? rawDataDir.trim() : fallback;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(baseDir, value);
}

function loadDotEnv() {
  const candidates = Array.from(
    new Set([path.join(PROJECT_ROOT, '.env'), path.join(process.cwd(), '.env')].map((value) => path.resolve(value)))
  );
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, override: false });
  }
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

module.exports = { PROJECT_ROOT, readEnv, assertRuntimeConfig, resolveDataDir };
