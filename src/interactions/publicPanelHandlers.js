'use strict';

const { MessageFlags } = require('discord.js');
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
  buildEmailResultMessage,
  buildInfoMessage,
} = require('../ui/ticketMessage');
const { buildEmailCredentialModal } = require('../ui/modals');
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
      const initialResult = await context.mailcowImapService.fetchLatest({
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
      context.emailTicketRepository.setMailProgress(
        created.ticket.id,
        initialResult.uidValidity,
        initialResult.newestUid,
        Date.now()
      );

      await created.channel.send(buildEmailResultMessage(initialResult));
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
  if (!['email_check', 'email_copy', 'email_close'].includes(action)) return;

  try {
    const ticketAndState = requireEmailTicketAccess(interaction, context);

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
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const creds = context.emailSessionService.getCredentials(ticketAndState.ticket.id);
      if (!creds) {
        await interaction.editReply(
          buildTicketErrorMessage('Reautentique para copiar: use o botão Verificar e envie novamente as credenciais no modal.')
        );
        return;
      }
      const latest = await context.mailcowImapService.fetchLatest({
        email: creds.email,
        password: creds.password,
        previousUidValidity: ticketAndState.state.uid_validity,
        previousUid: ticketAndState.state.last_seen_uid,
      });
      const text = latest.message ? latest.message.text : 'Sem e-mail disponível para cópia.';
      await interaction.editReply(buildInfoMessage(text, true));
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
      await interaction.channel.send(buildEmailResultMessage(result));
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
