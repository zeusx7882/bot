'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { assertGuildAdmin, AuthorizationError } = require('../utils/permissions');
const { buildTicketErrorMessage } = require('../ui/ticketMessage');

const data = new SlashCommandBuilder()
  .setName('link_pagamento')
  .setDescription('Cria um link de pagamento Sharpify (apenas administradores).')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addStringOption((opt) => opt.setName('nome').setDescription('Nome da cobrança').setRequired(true).setMaxLength(120))
  .addStringOption((opt) => opt.setName('valor').setDescription('Valor textual (major/minor conforme config)').setRequired(true).setMaxLength(32))
  .addStringOption((opt) => opt.setName('descricao').setDescription('Descrição opcional').setRequired(false).setMaxLength(200))
  .addStringOption((opt) =>
    opt
      .setName('metodo')
      .setDescription('Método de pagamento')
      .setRequired(true)
      .addChoices(
        { name: 'PIX', value: 'PIX' },
        { name: 'EFI_PAY_PREFERENCE', value: 'EFI_PAY_PREFERENCE' },
        { name: 'STRIPE_PREFERENCE', value: 'STRIPE_PREFERENCE' },
        { name: 'CUSTOMER_BALANCE', value: 'CUSTOMER_BALANCE' },
        { name: 'LITECOIN', value: 'LITECOIN' }
      )
  );

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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const result = await context.paymentLinkService.createLink({
      interactionId: interaction.id,
      guildId: interaction.guildId,
      channel: interaction.channel,
      creatorUserId: interaction.user.id,
      name: interaction.options.getString('nome', true),
      description: interaction.options.getString('descricao', false),
      amountRaw: interaction.options.getString('valor', true),
      gatewayMethod: interaction.options.getString('metodo', true),
    });
    const msg = result.createdNow
      ? '✅ Cobrança publicada no canal atual.'
      : 'ℹ️ Esta interação já havia sido processada; evitando criação duplicada.';
    await interaction.editReply({ content: msg, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } catch (error) {
    await interaction.editReply(buildTicketErrorMessage(error.message || 'Falha ao criar cobrança.'));
  }
}

module.exports = { data, execute };
