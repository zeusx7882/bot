'use strict';

const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { buildPaymentCard } = require('../ui/paymentMessage');
const { TicketServiceError } = require('../services/ticketService');

async function handleButton(interaction, parsed, context) {
  if (!interaction.inGuild() || interaction.guildId !== parsed.guildId) {
    await interaction.reply({ content: 'Este botão não pertence a este servidor.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (parsed.action !== 'verify') return;
  const recordId = parsed.args[0];
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) throw new TicketServiceError('Não foi possível validar sua permissão.');
  const record = context.paymentLinkRepository.getById(Number(recordId));
  if (!record || record.guild_id !== interaction.guildId) {
    throw new TicketServiceError('Cobrança não encontrada.');
  }
  const isAdmin = member.permissions?.has?.(PermissionFlagsBits.Administrator);
  const config = context.configService.getOrCreate(interaction.guildId).config;
  const isSupport = config.support_role_id ? member.roles?.cache?.has?.(config.support_role_id) : false;
  const isCreator = record.creator_user_id === interaction.user.id;
  if (!isAdmin && !isSupport && !isCreator) {
    throw new TicketServiceError('Somente criador, equipe autorizada ou administrador pode verificar esta cobrança.');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const refreshed = await context.paymentLinkService.refreshStatus({
    guildId: interaction.guildId,
    recordId,
  });
  await interaction.message.edit(buildPaymentCard({ guildId: interaction.guildId, ...refreshed }));
  await interaction.editReply({ content: `Status atualizado: ${refreshed.record.status}`, flags: MessageFlags.Ephemeral });
}

module.exports = { handleButton };
