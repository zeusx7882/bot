'use strict';

const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { buildPaymentCard } = require('../ui/paymentMessage');
const { TicketServiceError } = require('../services/ticketService');
const { buildPlainCopyReply } = require('../utils/plainReplies');

const COPY_COOLDOWN_MS = 2000;
const copyCooldowns = new Map();

async function handleButton(interaction, parsed, context) {
  if (!interaction.inGuild() || interaction.guildId !== parsed.guildId) {
    await interaction.reply({ content: 'Este botão não pertence a este servidor.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!['verify', 'copy_code', 'copy_link'].includes(parsed.action)) return;
  const recordId = parsed.args[0];
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) throw new TicketServiceError('Não foi possível validar sua permissão.');
  const record = context.paymentLinkRepository.getById(Number(recordId));
  if (!record || record.guild_id !== interaction.guildId) {
    throw new TicketServiceError('Cobrança não encontrada.');
  }
  assertRecordMatchesInteraction(record, interaction);

  if (parsed.action === 'copy_code' || parsed.action === 'copy_link') {
    assertChannelViewer(interaction, member);
    assertCopyCooldown(record, interaction, parsed.action);
    const rawValue = parsed.action === 'copy_code' ? record.payment_code : record.payment_url;
    await interaction.reply(
      buildPlainCopyReply(rawValue, {
        fileName: parsed.action === 'copy_code' ? 'codigo-pagamento.txt' : 'link-pagamento.txt',
        overflowMessage:
          parsed.action === 'copy_code'
            ? 'O código é grande demais para o chat; abra o arquivo efêmero e copie o valor bruto.'
            : 'O link é grande demais para o chat; abra o arquivo efêmero e copie o valor bruto.',
      })
    );
    return;
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

function assertRecordMatchesInteraction(record, interaction) {
  if (record.channel_id !== interaction.channelId || record.message_id !== interaction.message?.id) {
    throw new TicketServiceError('Esta mensagem de cobrança não corresponde ao registro salvo.');
  }
}

function assertChannelViewer(interaction, member) {
  const canView = interaction.channel?.permissionsFor?.(member)?.has?.(PermissionFlagsBits.ViewChannel);
  if (!canView) {
    throw new TicketServiceError('Você não tem permissão válida para copiar esta cobrança neste canal.');
  }
}

function assertCopyCooldown(record, interaction, action) {
  const key = `${record.id}:${interaction.user.id}:${interaction.channelId}:${action}`;
  const now = Date.now();
  const until = copyCooldowns.get(key) || 0;
  if (until > now) {
    const seconds = Math.max(1, Math.ceil((until - now) / 1000));
    throw new TicketServiceError(`Aguarde ${seconds}s antes de copiar novamente.`);
  }
  copyCooldowns.set(key, now + COPY_COOLDOWN_MS);
}

module.exports = { handleButton };
