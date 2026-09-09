'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { assertGuildAdmin, AuthorizationError } = require('../utils/permissions');
const { buildConfigPanel, CONFIG_PAGE_IDS } = require('../ui/configPanel');
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
    page: CONFIG_PAGE_IDS.APPEARANCE,
  });

  try {
    await interaction.reply(payload);
  } catch (error) {
    logger.error('Falha ao responder ao comando /ticket_painel', error);
    const fallback = {
      content: '❌ Não foi possível abrir o painel agora. Tente novamente com /ticket_painel.',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(fallback);
      } else {
        await interaction.reply(fallback);
      }
    } catch {}
  }
}

module.exports = { data, execute };
