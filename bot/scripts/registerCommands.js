'use strict';

const { REST, Routes } = require('discord.js');
const { readEnv } = require('../src/config/env');
const { getCommandPayloads } = require('./commandDefinitions');
const { logger } = require('../src/utils/logger');

/**
 * Registra os comandos de barra (slash commands). Se DISCORD_GUILD_ID
 * estiver definido, registra apenas nessa guild (propagação instantânea,
 * ideal para desenvolvimento). Caso contrário, registra globalmente (pode
 * levar até 1 hora para propagar por todos os servidores).
 */
async function registerCommands() {
  const env = readEnv();
  if (!env.token || !env.clientId) {
    throw new Error(
      'DISCORD_TOKEN e DISCORD_CLIENT_ID são obrigatórios para registrar os comandos. Configure o arquivo .env.'
    );
  }

  const commands = getCommandPayloads();
  const rest = new REST().setToken(env.token);

  if (env.guildId) {
    await rest.put(Routes.applicationGuildCommands(env.clientId, env.guildId), { body: commands });
    logger.info(`Comandos registrados na guild ${env.guildId} (modo desenvolvimento).`);
  } else {
    await rest.put(Routes.applicationCommands(env.clientId), { body: commands });
    logger.info('Comandos registrados globalmente (pode levar até 1 hora para propagar).');
  }
}

if (require.main === module) {
  registerCommands().catch((error) => {
    logger.error('Falha ao registrar comandos', error);
    process.exit(1);
  });
}

module.exports = { registerCommands };
