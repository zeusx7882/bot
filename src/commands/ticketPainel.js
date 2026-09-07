'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { assertGuildAdmin, AuthorizationError } = require('../utils/permissions');
const { buildConfigPanel } = require('../ui/configPanel');
const { logger } = require('../utils/logger');

const data = new SlashCommandBuilder()
  .setName('ticket_painel')
  .setDescription('Abre o painel de configuração do sistema de tickets (apenas administradores).')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

async function execute(interaction, context) {
  try {
    await assertGuildAdmin(interaction);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
      return;
    }
    throw error;
  }

  const { config, options } = context.configService.getOrCreate(interaction.guildId);
  const payload = buildConfigPanel({
    guildId: interaction.guildId,
    guildName: interaction.guild.name,
    config,
    options,
  });

  await interaction.reply(payload).catch((error) => {
    logger.error('Falha ao responder ao comando /ticket_painel', error);
  });
}

module.exports = { data, execute };
