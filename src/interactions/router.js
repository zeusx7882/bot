'use strict';

const customId = require('../ui/customId');
const configHandlers = require('./configHandlers');
const publicPanelHandlers = require('./publicPanelHandlers');
const { logger } = require('../utils/logger');
const { MessageFlags } = require('discord.js');

/**
 * Roteador global de interações. Usa exclusivamente o customId persistente
 * (não collectors em memória), então continua funcionando após reinícios do
 * processo. Toda ação passa antes pelos handlers de configuração/tickets,
 * que revalidam autorização e contexto de guild.
 */
async function routeInteraction(interaction, context) {
  try {
    if (interaction.isChatInputCommand()) {
      const command = context.commands.get(interaction.commandName);
      if (!command) {
        logger.warn(`Comando desconhecido recebido: ${interaction.commandName}`);
        return;
      }
      return await command.execute(interaction, context);
    }

    if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
      const parsed = customId.parse(interaction.customId);
      if (!parsed) {
        return;
      }

      if (parsed.scope === 'cfg') {
        if (interaction.isButton()) return await configHandlers.handleButton(interaction, parsed, context);
        if (interaction.isAnySelectMenu()) return await configHandlers.handleSelect(interaction, parsed, context);
        if (interaction.isModalSubmit()) return await configHandlers.handleModalSubmit(interaction, parsed, context);
      }

      if (parsed.scope === 'ticket') {
        if (parsed.action === 'open' && interaction.isStringSelectMenu()) {
          return await publicPanelHandlers.handleOpenSelect(interaction, parsed, context);
        }
        if (interaction.isButton()) {
          return await publicPanelHandlers.handleButton(interaction, parsed, context);
        }
        if (interaction.isModalSubmit()) {
          return await publicPanelHandlers.handleModalSubmit(interaction, parsed, context);
        }
      }
    }
  } catch (error) {
    logger.error('Erro não tratado ao processar interação', error);
    await safeErrorReply(interaction).catch(() => {});
  }
}

async function safeErrorReply(interaction) {
  const content = '❌ Ocorreu um erro inesperado ao processar sua ação. Tente novamente.';
  if (!interaction.isRepliable || !interaction.isRepliable()) return;
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

module.exports = { routeInteraction };
