'use strict';

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { DuplicateTicketError } = require('../storage/ticketRepository');
const { buildTicketOpenedMessage, buildEmailTicketOpenedMessage } = require('../ui/ticketMessage');
const { logger } = require('../utils/logger');

class TicketServiceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TicketServiceError';
  }
}

class AlreadyHasTicketError extends Error {
  constructor(channelId) {
    super('Você já possui um ticket em aberto.');
    this.name = 'AlreadyHasTicketError';
    this.channelId = channelId;
  }
}

class TicketService {
  constructor({ ticketRepository, guildConfigRepository, panelOptionRepository, emailTicketRepository = null }) {
    this.ticketRepository = ticketRepository;
    this.guildConfigRepository = guildConfigRepository;
    this.panelOptionRepository = panelOptionRepository;
    this.emailTicketRepository = emailTicketRepository;
  }


  async createTicket({ guild, member, optionId }) {
    const created = await this.createNormalTicket({ guild, member, optionId });
    return created.channel;
  }

  async createNormalTicket({ guild, member, optionId }) {
    const config = this.guildConfigRepository.get(guild.id);
    if (!config || !config.category_id || !config.support_role_id) {
      throw new TicketServiceError('O painel de tickets ainda não está totalmente configurado neste servidor.');
    }

    const option = this.panelOptionRepository.get(guild.id, optionId);
    if (!option) {
      throw new TicketServiceError('Esta opção não existe mais. Peça para a equipe atualizar o painel.');
    }

    const category = await guild.channels.fetch(config.category_id).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      throw new TicketServiceError('A categoria configurada para tickets não existe mais. Avise um administrador.');
    }

    const supportRole = await guild.roles.fetch(config.support_role_id).catch(() => null);
    if (!supportRole) {
      throw new TicketServiceError('O cargo de suporte configurado não existe mais. Avise um administrador.');
    }

    const ticket = await this._acquireLock(guild, member.id, option, 'normal');
    const botMember = await guild.members.fetchMe().catch(() => guild.members.me);

    let channel = null;
    try {
      channel = await guild.channels.create({
        name: buildChannelName(`ticket-${member.user.username}`),
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Ticket de ${member.user.tag} · Opção: ${option.label}`,
        permissionOverwrites: buildNormalOverwrites({
          guildId: guild.id,
          memberId: member.id,
          supportRoleId: supportRole.id,
          botUserId: botMember?.id,
        }),
      });

      await channel.send(
        buildTicketOpenedMessage({
          guildId: guild.id,
          authorId: member.id,
          supportRoleId: supportRole.id,
          optionLabel: option.label,
          optionDescription: option.description,
        })
      );

      if (config.normal_logs_channel_id) {
        const logsChannel = await guild.channels.fetch(config.normal_logs_channel_id).catch(() => null);
        if (logsChannel?.isTextBased()) {
          await logsChannel.send({
            content: [
              '🆕 Ticket normal aberto',
              `Autor: <@${member.id}>`,
              `Canal: <#${channel.id}>`,
              `Opção: ${option.label}`,
              `Horário: ${new Date().toISOString()}`,
            ].join('\n'),
            allowedMentions: { parse: [] },
          }).catch(() => {});
        }
      }

      const opened = this.ticketRepository.markOpen(ticket.id, channel.id);
      return { channel, ticket: opened };
    } catch (error) {
      logger.error('Falha ao criar ticket normal, revertendo alterações', error);
      this.ticketRepository.releaseLock(ticket.id);
      if (channel) {
        await channel.delete('Falha ao concluir a criação do ticket').catch(() => {});
      }
      throw error;
    }
  }

  async createEmailTicket({ guild, member, optionLabel, optionDescription, inactivityDeadlineAt }) {
    const config = this.guildConfigRepository.get(guild.id);
    if (!config || !config.email_option_enabled || !config.email_category_id) {
      throw new TicketServiceError('A opção de verificação de e-mail não está configurada neste servidor.');
    }

    const category = await guild.channels.fetch(config.email_category_id).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      throw new TicketServiceError('A categoria exclusiva de e-mail não existe mais. Avise um administrador.');
    }

    const option = { id: '__email_verify_option__', label: optionLabel, description: optionDescription };
    const ticket = await this._acquireLock(guild, member.id, option, 'email');
    const botMember = await guild.members.fetchMe().catch(() => guild.members.me);

    let channel = null;
    try {
      channel = await guild.channels.create({
        name: buildChannelName(`email-${member.user.username}`),
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Ticket de e-mail de ${member.user.tag}`,
        permissionOverwrites: buildEmailOverwrites({
          guildId: guild.id,
          memberId: member.id,
          botUserId: botMember?.id,
        }),
      });

      const opened = this.ticketRepository.markOpen(ticket.id, channel.id);

      await channel.send(
        buildEmailTicketOpenedMessage({
          guildId: guild.id,
          authorId: member.id,
          optionLabel,
          optionDescription,
          inactivityDeadlineAt,
        })
      );

      return { channel, ticket: opened };
    } catch (error) {
      logger.error('Falha ao criar ticket de e-mail, revertendo alterações', error);
      this.ticketRepository.releaseLock(ticket.id);
      if (channel) {
        await channel.delete('Falha ao concluir a criação do ticket').catch(() => {});
      }
      throw error;
    }
  }

  async _acquireLock(guild, userId, option, ticketType) {
    try {
      return this.ticketRepository.createLock(guild.id, userId, option.id, option.label, ticketType);
    } catch (error) {
      if (!(error instanceof DuplicateTicketError)) throw error;

      const existing = this.ticketRepository.findActive(guild.id, userId, ticketType);
      if (existing && existing.channel_id) {
        const stillExists = await guild.channels.fetch(existing.channel_id).catch(() => null);
        if (stillExists) {
          throw new AlreadyHasTicketError(existing.channel_id);
        }
        this.ticketRepository.removeStale(existing.id);
      } else if (existing) {
        this.ticketRepository.removeStale(existing.id);
      }

      return this.ticketRepository.createLock(guild.id, userId, option.id, option.label, ticketType);
    }
  }
}

function buildChannelName(baseName) {
  const base = baseName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (base || `ticket-${Date.now()}`).slice(0, 90);
}

function buildNormalOverwrites({ guildId, memberId, supportRoleId, botUserId }) {
  const memberPerms = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
  ];

  const overwrites = [
    { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: memberId, allow: memberPerms },
    { id: supportRoleId, allow: memberPerms },
  ];

  if (botUserId) {
    overwrites.push({
      id: botUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  return overwrites;
}

function buildEmailOverwrites({ guildId, memberId, botUserId }) {
  const memberPerms = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ];

  const overwrites = [
    { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
    { id: memberId, allow: memberPerms },
  ];

  if (botUserId) {
    overwrites.push({
      id: botUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  return overwrites;
}

module.exports = { TicketService, TicketServiceError, AlreadyHasTicketError };
