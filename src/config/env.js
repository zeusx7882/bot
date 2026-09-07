'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config();

/**
 * Configuração de ambiente centralizada. Falha rápido (fail-fast) se variáveis
 * obrigatórias estiverem ausentes, exceto quando explicitamente carregado em
 * modo de teste (`NODE_ENV=test`), onde os valores podem ser sobrescritos.
 */
function readEnv(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR && env.DATA_DIR.trim() ? env.DATA_DIR.trim() : './data');

  return {
    token: env.DISCORD_TOKEN || '',
    clientId: env.DISCORD_CLIENT_ID || '',
    guildId: env.DISCORD_GUILD_ID && env.DISCORD_GUILD_ID.trim() ? env.DISCORD_GUILD_ID.trim() : null,
    dataDir,
    dbPath: path.join(dataDir, 'ticket-bot.sqlite'),
    nodeEnv: env.NODE_ENV || 'production',
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
