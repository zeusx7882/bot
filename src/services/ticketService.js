'use strict';

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { DuplicateTicketError } = require('../storage/ticketRepository');
const { buildTicketOpenedMessage } = require('../ui/ticketMessage');
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
  constructor({ ticketRepository, guildConfigRepository, panelOptionRepository }) {
    this.ticketRepository = ticketRepository;
    this.guildConfigRepository = guildConfigRepository;
    this.panelOptionRepository = panelOptionRepository;
  }

  /**
   * Cria um ticket para `member` na `guild`, a partir da opção `optionId`.
   * Todo o fluxo é resiliente: falhas em qualquer etapa liberam o lock do
   * banco (permitindo nova tentativa) e desfazem o canal criado, se houver,
   * evitando registros travados ou canais órfãos.
   */
  async createTicket({ guild, member, optionId }) {
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

    const ticket = await this._acquireLock(guild, member.id, option);

    let channel = null;
    try {
      channel = await guild.channels.create({
        name: buildChannelName(member.user.username),
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Ticket de ${member.user.tag} · Opção: ${option.label}`,
        permissionOverwrites: buildPermissionOverwrites({
          guildId: guild.id,
          memberId: member.id,
          supportRoleId: supportRole.id,
          botUserId: guild.members.me?.id,
        }),
      });

      await channel.send(
        buildTicketOpenedMessage({
          authorId: member.id,
          supportRoleId: supportRole.id,
          optionLabel: option.label,
          optionDescription: option.description,
        })
      );

      this.ticketRepository.markOpen(ticket.id, channel.id);
      return channel;
    } catch (error) {
      logger.error('Falha ao criar ticket, revertendo alterações', error);
      this.ticketRepository.releaseLock(ticket.id);
      if (channel) {
        await channel.delete('Falha ao concluir a criação do ticket').catch(() => {});
      }
      throw error;
    }
  }

  async _acquireLock(guild, userId, option) {
    try {
      return this.ticketRepository.createLock(guild.id, userId, option.id, option.label);
    } catch (error) {
      if (!(error instanceof DuplicateTicketError)) throw error;

      const existing = this.ticketRepository.findActive(guild.id, userId);
      if (existing && existing.channel_id) {
        const stillExists = await guild.channels.fetch(existing.channel_id).catch(() => null);
        if (stillExists) {
          throw new AlreadyHasTicketError(existing.channel_id);
        }
        // Canal foi apagado manualmente: libera o registro para permitir nova tentativa.
        this.ticketRepository.removeStale(existing.id);
      } else if (existing) {
        // Estava preso em "creating" (ex.: processo anterior falhou antes de liberar).
        this.ticketRepository.removeStale(existing.id);
      }

      return this.ticketRepository.createLock(guild.id, userId, option.id, option.label);
    }
  }
}

function buildChannelName(username) {
  const base = `ticket-${username}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (base || `ticket-${Date.now()}`).slice(0, 90);
}

/**
 * Overwrites explícitos e mínimos do canal do ticket: nega @everyone,
 * concede acesso apenas ao autor, ao cargo de suporte e ao bot. Não herda
 * overwrites permissivos da categoria (o Discord só sincroniza automático se
 * alguém clicar em "Sincronizar permissões").
 */
function buildPermissionOverwrites({ guildId, memberId, supportRoleId, botUserId }) {
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

module.exports = { TicketService, TicketServiceError, AlreadyHasTicketError };
