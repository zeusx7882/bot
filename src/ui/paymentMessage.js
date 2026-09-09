'use strict';

const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const customId = require('./customId');

function buildPaymentCard({ guildId, record, paymentData }) {
  const container = new ContainerBuilder();
  const paymentCode = paymentData?.payment?.gateway?.data?.code ?? record.payment_code;
  const paymentUrl = record.payment_url || null;
  const lines = [
    '## 💳 Cobrança Sharpify',
    `**Nome:** ${record.name}`,
    record.description ? `**Descrição:** ${record.description}` : null,
    `**Valor informado:** ${record.amount_input} (${record.amount_unit}, ${record.currency})`,
    `**Método:** ${record.gateway_method}`,
    `**Status:** ${paymentData?.status || record.status}`,
    `**ID:** ${record.payment_link_id}`,
  ].filter(Boolean);

  if (paymentData?.payment?.gateway?.name) {
    lines.push(`**Gateway:** ${paymentData.payment.gateway.name}`);
  }
  if (paymentData?.payment?.gateway?.data?.hasQrCode) {
    lines.push('**QR disponível:** sim');
  }
  if (paymentCode) {
    lines.push(`**Código:** ${String(paymentCode).slice(0, 500)}`);
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  const verify = new ButtonBuilder()
    .setCustomId(customId.build('pay', 'verify', guildId, record.id))
    .setLabel('Verificar pagamento')
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(verify);
  if (paymentCode) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(customId.build('pay', 'copy_code', guildId, record.id))
        .setLabel('Copiar código')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (paymentUrl) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(customId.build('pay', 'copy_link', guildId, record.id))
        .setLabel('Copiar link')
        .setStyle(ButtonStyle.Secondary)
    );
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir pagamento').setURL(paymentUrl));
  }
  container.addActionRowComponents(row);

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

module.exports = { buildPaymentCard };
