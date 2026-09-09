'use strict';

const { MessageFlags, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  EMAIL_OPTION_ID,
  INACTIVITY_TIMEOUT_MS,
  VERIFY_COOLDOWN_MS,
  CLOSE_TIMEOUT_MS,
  parseCredentialInput,
} = require('../domain/emailVerification');
const { DuplicateTicketError } = require('../storage/ticketRepository');
const { AlreadyHasTicketError, TicketServiceError } = require('../services/ticketService');
const {
  buildTicketCreatedConfirmation,
  buildTicketErrorMessage,
  buildEmailConnectedMessage,
  buildEmailResultMessage,
  buildInfoMessage,
} = require('../ui/ticketMessage');
const { buildEmailCredentialModal } = require('../ui/modals');
const { buildPlainCopyReply } = require('../utils/plainReplies');
const { logger } = require('../utils/logger');

async function handleOpenSelect(interaction, parsed, context) {
  if (!interaction.inGuild() || interaction.guildId !== parsed.guildId) {
    await interaction.reply({ content: 'Este painel não é válido neste servidor.', flags: MessageFlags.Ephemeral });
    return;
  }

  const optionId = interaction.values[0];
  if (optionId === EMAIL_OPTION_ID) {
    const config = context.configService.getOrCreate(interaction.guildId).config;
    if (!config.email_option_enabled) {
      await interaction.reply({ content: 'Esta opção de e-mail está desabilitada no momento.', flags: MessageFlags.Ephemeral });
      return;
    }
    const sessionId = context.emailSessionService.createModalSession({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      channelId: null,
    });
    await interaction.showModal(buildEmailCredentialModal(interaction.guildId, sessionId, 'email_auth_submit'));
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const created = await context.ticketService.createNormalTicket({
      guild: interaction.guild,
      member: interaction.member,
      optionId,
    });
    await interaction.editReply(buildTicketCreatedConfirmation(created.channel.id));
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

async function handleModalSubmit(interaction, parsed, context) {
  const action = parsed.action;
  if (action !== 'email_auth_submit' && action !== 'email_reauth_submit') return;

  const sessionId = parsed.args[0];
  try {
    context.emailSessionService.consumeModalSession(sessionId, {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      channelId: action === 'email_reauth_submit' ? interaction.channelId : null,
    });

    context.emailSessionService.assertCooldown(`auth:${interaction.guildId}:${interaction.user.id}`, 3000);
    const credentials = parseCredentialInput(interaction.fields.getTextInputValue('account'));

    if (action === 'email_auth_submit') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await context.mailcowImapService.authenticate({
        email: credentials.email,
        password: credentials.password,
      });

      const inactivityDeadlineAt = Date.now() + INACTIVITY_TIMEOUT_MS;
      const config = context.configService.getOrCreate(interaction.guildId).config;
      const created = await context.ticketService.createEmailTicket({
        guild: interaction.guild,
        member: interaction.member,
        optionLabel: config.email_option_label,
        optionDescription: config.email_option_description,
        inactivityDeadlineAt,
      });

      context.emailTicketLifecycleService.registerEmailTicketOpen(created.ticket);
      context.emailSessionService.setCredentials(created.ticket.id, credentials);

      await created.channel.send(
        buildEmailConnectedMessage({
          email: credentials.email,
          config,
        })
      );
      await interaction.editReply(buildTicketCreatedConfirmation(created.channel.id));
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ticketAndState = requireEmailTicketAccess(interaction, context);
    context.emailSessionService.setCredentials(ticketAndState.ticket.id, credentials);
    context.emailTicketLifecycleService.touchOwnerActivity(ticketAndState.ticket.id);
    await interaction.editReply(buildTicketErrorMessage('Credenciais atualizadas temporariamente para este ticket.'));
  } catch (error) {
    await respondInteractionError(interaction, error);
  }
}

async function handleButton(interaction, parsed, context) {
  if (!interaction.inGuild() || interaction.guildId !== parsed.guildId) {
    await interaction.reply({ content: 'Este botão não pertence a este servidor.', flags: MessageFlags.Ephemeral });
    return;
  }

  const { action } = parsed;
  if (!['email_check', 'email_copy', 'email_close', 'email_result_delete', 'normal_close', 'normal_close_confirm', 'normal_notify'].includes(action)) return;

  try {
    if (action === 'normal_close' || action === 'normal_close_confirm' || action === 'normal_notify') {
      await handleNormalTicketButton(interaction, parsed, context, action);
      return;
    }

    const ticketAndState = requireEmailTicketAccess(interaction, context);

    if (action === 'email_result_delete') {
      await handleEmailResultDelete(interaction, context, ticketAndState);
      return;
    }

    if (action === 'email_close') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      context.emailSessionService.clearCredentials(ticketAndState.ticket.id);
      const deadlineAt = context.emailTicketLifecycleService.beginClosing(
        ticketAndState.ticket.id,
        'Fechamento solicitado pelo autor.'
      );
      await interaction.channel.send(buildInfoMessage(`🛑 Ticket será encerrado em <t:${Math.floor(deadlineAt / 1000)}:R>.`));
      await interaction.editReply(buildTicketErrorMessage(`Encerramento agendado para ${CLOSE_TIMEOUT_MS / 1000}s.`));
      return;
    }

    context.emailTicketLifecycleService.touchOwnerActivity(ticketAndState.ticket.id);

    if (action === 'email_copy') {
      const creds = context.emailSessionService.getCredentials(ticketAndState.ticket.id);
      if (!creds) {
        await interaction.reply(
          buildTicketErrorMessage('Reautentique para copiar: use o botão Verificar e envie novamente as credenciais no modal.')
        );
        return;
      }
      await interaction.reply(
        buildPlainCopyReply(`${creds.email}:${creds.password}`, {
          fileName: 'conta-email.txt',
          overflowMessage: 'A conta ficou grande demais para o chat; abra o arquivo efêmero e copie o texto bruto.',
        })
      );
      return;
    }

    context.emailSessionService.assertCooldown(`verify:${ticketAndState.ticket.id}:${interaction.channelId}`, VERIFY_COOLDOWN_MS);
    const creds = context.emailSessionService.getCredentials(ticketAndState.ticket.id);
    if (!creds) {
      const sessionId = context.emailSessionService.createModalSession({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        channelId: interaction.channelId,
      });
      await interaction.showModal(buildEmailCredentialModal(interaction.guildId, sessionId, 'email_reauth_submit'));
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await context.mailcowImapService.fetchLatest({
      email: creds.email,
      password: creds.password,
      previousUidValidity: ticketAndState.state.uid_validity,
      previousUid: ticketAndState.state.last_seen_uid,
    });

    context.emailTicketRepository.setMailProgress(
      ticketAndState.ticket.id,
      result.uidValidity,
      result.newestUid,
      Date.now()
    );

    if (result.hasNew) {
      const sent = await interaction.channel.send(buildEmailResultMessage({ guildId: interaction.guildId, result }));
      context.emailResultMessageRepository.track({
        ticketId: ticketAndState.ticket.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        messageId: sent.id,
        ownerUserId: interaction.user.id,
      });
      await interaction.editReply(buildTicketErrorMessage('Novo e-mail processado e publicado no ticket.'));
    } else {
      await interaction.editReply(buildTicketErrorMessage('Nenhuma nova mensagem desde a última verificação.'));
    }
  } catch (error) {
    await respondInteractionError(interaction, error);
  }
}

function requireEmailTicketAccess(interaction, context) {
  const ticket = context.ticketRepository.findByChannel(interaction.guildId, interaction.channelId);
  if (!ticket || ticket.ticket_type !== 'email') {
    throw new TicketServiceError('Este canal não é um ticket de e-mail válido.');
  }
  if (ticket.user_id !== interaction.user.id) {
    throw new TicketServiceError('Apenas o autor deste ticket pode usar esta ação.');
  }
  if (ticket.status === 'closing' || ticket.status === 'closed') {
    throw new TicketServiceError('Este ticket já está em encerramento.');
  }
  const state = context.emailTicketRepository.getByChannel(interaction.guildId, interaction.channelId);
  if (!state || state.owner_user_id !== interaction.user.id || state.ticket_id !== ticket.id) {
    throw new TicketServiceError('Estado do ticket inválido.');
  }
  return { ticket, state };
}

async function respondInteractionError(interaction, error) {
  const message = error instanceof TicketServiceError ? error.message : error.message || 'Erro inesperado.';
  const payload = buildTicketErrorMessage(message);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

module.exports = { handleOpenSelect, handleButton, handleModalSubmit, requireEmailTicketAccess };

async function handleNormalTicketButton(interaction, parsed, context, action) {
  if (!interaction.inGuild() || interaction.guildId !== parsed.guildId) {
    await interaction.reply({ content: 'Este botão não pertence a este servidor.', flags: MessageFlags.Ephemeral });
    return;
  }
  const current = await getNormalTicketContext(interaction, context);
  const { ticket, config, member, isAdmin, isSupport } = current;

  if (action === 'normal_notify') {
    if (!isAdmin && !isSupport) {
      throw new TicketServiceError('Apenas equipe de suporte ou administrador pode avisar o autor deste ticket.');
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await context.normalTicketAlertService.notifyAuthor({
      guild: interaction.guild,
      channel: interaction.channel,
      ticket,
    });
    await interaction.editReply({
      content:
        result.delivery === 'dm'
          ? '✅ DM enviada ao autor do ticket.'
          : '⚠️ A DM falhou; publiquei um aviso no próprio ticket mencionando apenas o autor.',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (!isAdmin && !current.isAuthor && !isSupport) {
    throw new TicketServiceError('Apenas autor, equipe de suporte ou administrador pode encerrar este ticket.');
  }

  if (action !== 'normal_close' && action !== 'normal_close_confirm') {
    return;
  }

  const confirmed = action === 'normal_close_confirm';
  if (!ticket || ticket.ticket_type !== 'normal') {
    throw new TicketServiceError('Este canal não é um ticket normal válido.');
  }

  if (!confirmed) {
    await interaction.reply(
      buildInfoMessage(
        [
          'Confirma encerrar este ticket normal?',
          config.normal_logs_channel_id
            ? 'O transcript HTML será enviado ao canal de logs configurado antes da exclusão.'
            : '⚠️ Logs/transcript estão desabilitados para este servidor; o canal será excluído sem arquivamento.',
        ].join('\n'),
        true
      )
    );
    await interaction.followUp({
      content: 'Clique para confirmar o encerramento.',
      flags: MessageFlags.Ephemeral,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`tp:ticket:normal_close_confirm:${interaction.guildId}`)
            .setLabel('Confirmar encerramento')
            .setStyle(ButtonStyle.Danger)
        ),
      ],
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await context.normalTicketClosureService.closeTicket({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    requestedByUserId: interaction.user.id,
    interaction,
  });
  await interaction.editReply(buildTicketErrorMessage('Encerramento concluído.'));
}

async function getNormalTicketContext(interaction, context) {
  const ticket = context.ticketRepository.findByChannel(interaction.guildId, interaction.channelId);
  if (!ticket || ticket.ticket_type !== 'normal') {
    throw new TicketServiceError('Este canal não é um ticket normal válido.');
  }
  if (ticket.status === 'closing' || ticket.status === 'closed') {
    throw new TicketServiceError('Este ticket já está em encerramento.');
  }

  const config = context.configService.getOrCreate(interaction.guildId).config;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) throw new TicketServiceError('Não foi possível validar sua permissão neste servidor.');

  return {
    ticket,
    config,
    member,
    isAdmin: Boolean(member.permissions?.has?.(PermissionFlagsBits.Administrator)),
    isAuthor: ticket.user_id === interaction.user.id,
    isSupport: config.support_role_id ? member.roles?.cache?.has?.(config.support_role_id) : false,
  };
}

async function handleEmailResultDelete(interaction, context, ticketAndState) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const tracked = context.emailResultMessageRepository.getByMessage(
    interaction.guildId,
    interaction.channelId,
    interaction.message.id
  );
  if (
    !tracked ||
    tracked.ticket_id !== ticketAndState.ticket.id ||
    tracked.owner_user_id !== interaction.user.id
  ) {
    await interaction.editReply(buildTicketErrorMessage('Esta mensagem não pode ser apagada por este botão.'));
    return;
  }

  try {
    await interaction.message.delete();
    context.emailResultMessageRepository.deleteByMessage(interaction.guildId, interaction.channelId, interaction.message.id);
    await interaction.editReply({
      content: '✅ Mensagem de resultado apagada.',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    if (isUnknownMessageError(error)) {
      context.emailResultMessageRepository.deleteByMessage(interaction.guildId, interaction.channelId, interaction.message.id);
      await interaction.editReply({
        content: 'ℹ️ Esta mensagem já havia sido apagada.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }
    if (isMissingPermissionsError(error)) {
      await interaction.editReply(buildTicketErrorMessage('Não tenho permissão para apagar esta mensagem neste canal.'));
      return;
    }
    throw error;
  }
}

function isUnknownMessageError(error) {
  return Number(error?.code) === 10008;
}

function isMissingPermissionsError(error) {
  return Number(error?.code) === 50013;
}
