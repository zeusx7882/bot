'use strict';

const { MessageFlags } = require('discord.js');
const { DuplicateTicketError } = require('../storage/ticketRepository');
const { AlreadyHasTicketError, TicketServiceError } = require('../services/ticketService');
const { buildTicketCreatedConfirmation, buildTicketErrorMessage } = require('../ui/ticketMessage');
const { logger } = require('../utils/logger');

/**
 * Manipula a seleção de uma opção no painel público de tickets. Revalida
 * que a interação ocorre na guild esperada antes de qualquer operação, e
 * adia a resposta antes de criar o canal (operação potencialmente lenta),
 * evitando resposta duplicada.
 */
async function handleOpenSelect(interaction, parsed, context) {
  if (!interaction.inGuild() || interaction.guildId !== parsed.guildId) {
    await interaction.reply({ content: 'Este painel não é válido neste servidor.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const optionId = interaction.values[0];

  try {
    const channel = await context.ticketService.createTicket({
      guild: interaction.guild,
      member: interaction.member,
      optionId,
    });
    await interaction.editReply(buildTicketCreatedConfirmation(channel.id));
  } catch (error) {
    if (error instanceof AlreadyHasTicketError || error instanceof DuplicateTicketError) {
      const channelId = error.channelId;
      await interaction.editReply(
        buildTicketErrorMessage(
          channelId ? `Você já possui um ticket em aberto: <#${channelId}>` : 'Você já possui um ticket em aberto.'
        )
      );
      return;
    }
    if (error instanceof TicketServiceError) {
      await interaction.editReply(buildTicketErrorMessage(error.message));
      return;
    }
    logger.error('Falha inesperada ao abrir ticket', error);
    await interaction.editReply(
      buildTicketErrorMessage('Ocorreu um erro inesperado ao criar seu ticket. Tente novamente mais tarde.')
    );
  }
}

module.exports = { handleOpenSelect };
