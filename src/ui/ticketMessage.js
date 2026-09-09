'use strict';

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const customId = require('./customId');

function buildTicketOpenedMessage({ authorId, supportRoleId, optionLabel, optionDescription }) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## 🎫 Ticket aberto\n<@${authorId}> abriu um ticket. <@&${supportRoleId}> por favor atendam assim que possível.`
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `**Autor:** <@${authorId}>`,
        `**Opção selecionada:** ${optionLabel}`,
        optionDescription ? `**Detalhes:** ${optionDescription}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    )
  );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [], users: [authorId], roles: [supportRoleId] },
  };
}

function buildEmailTicketOpenedMessage({ guildId, authorId, optionLabel, optionDescription, inactivityDeadlineAt }) {
  const container = new ContainerBuilder();
  const deadline = `<t:${Math.floor(inactivityDeadlineAt / 1000)}:R>`;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        '## 📧 Ticket de verificação de e-mail aberto',
        `<@${authorId}> abriu a opção **${optionLabel}**.`,
        optionDescription ? `_${optionDescription}_` : null,
      ]
        .filter(Boolean)
        .join('\n')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        '⚠️ **Aviso de confidencialidade:** credenciais foram recebidas pelo Discord sem mascaramento de senha.',
        'Use preferencialmente senha de aplicativo e somente contas autorizadas por você.',
        'Administradores do Discord ainda podem visualizar o canal e seu conteúdo.',
        `Sem atividade válida do autor por 6 minutos, este canal será encerrado automaticamente (${deadline}).`,
      ].join('\n')
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId.build('ticket', 'email_check', guildId))
        .setLabel('Verificar')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(customId.build('ticket', 'email_copy', guildId))
        .setLabel('Mostrar para copiar')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(customId.build('ticket', 'email_close', guildId))
        .setLabel('Encerrar')
        .setStyle(ButtonStyle.Danger)
    )
  );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [], users: [authorId] },
  };
}

function buildEmailResultMessage(result) {
  const container = new ContainerBuilder();
  if (!result.message) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('📭 Nenhum e-mail encontrado na INBOX.')
    );
    return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
  }

  const lines = [
    '## 📨 Último e-mail encontrado',
    `**Remetente:** ${result.message.from}`,
    `**Assunto:** ${result.message.subject}`,
    `**Recebido (INTERNALDATE):** ${result.message.internalDate || 'indisponível'}`,
    '',
    '**Corpo (texto sanitizado):**',
    result.message.text,
  ];

  if (result.message.truncated) {
    lines.push('', '_Conteúdo truncado por limite de segurança._');
  }

  if (result.message.links.length > 0) {
    lines.push('', '**Links http(s) detectados:**', ...result.message.links.map((link) => `- <${link}>`));
  } else {
    lines.push('', '_Nenhum link http(s) detectado no e-mail._');
  }

  lines.push('', '_Não assuma autenticidade apenas pelo remetente._');

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}


function buildInfoMessage(text, ephemeral = false) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return {
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function buildTicketCreatedConfirmation(channelId) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`✅ Seu ticket foi criado: <#${channelId}>`)
  );
  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function buildTicketErrorMessage(message) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`❌ ${message}`));
  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  buildTicketOpenedMessage,
  buildEmailTicketOpenedMessage,
  buildEmailResultMessage,
  buildInfoMessage,
  buildTicketCreatedConfirmation,
  buildTicketErrorMessage,
};
