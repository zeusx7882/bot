'use strict';

const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');

/**
 * Monta a mensagem inicial (Components V2) enviada no canal privado do
 * ticket recém-criado. Menciona apenas o cargo de suporte e o autor,
 * usando `allowedMentions` explícito para impedir @everyone/@here ou
 * menções arbitrárias.
 */
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
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '_Descreva sua solicitação com detalhes. A equipe de suporte irá te atender neste canal em breve._'
    )
  );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [], users: [authorId], roles: [supportRoleId] },
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

module.exports = { buildTicketOpenedMessage, buildTicketCreatedConfirmation, buildTicketErrorMessage };
