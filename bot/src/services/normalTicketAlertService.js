'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { TicketServiceError } = require('./ticketService');

const ALERT_COOLDOWN_MS = 60000;

class NormalTicketAlertService {
  constructor({ normalTicketAlertRepository, now = () => Date.now() }) {
    this.normalTicketAlertRepository = normalTicketAlertRepository;
    this.now = now;
    this.processing = new Set();
  }

  clearTicket(ticketId) {
    this.processing.delete(ticketId);
    this.normalTicketAlertRepository.clearTicket(ticketId);
  }

  async notifyAuthor({ guild, channel, ticket }) {
    if (!channel || channel.id !== ticket.channel_id || !channel.isTextBased()) {
      throw new TicketServiceError('Canal do ticket não está acessível para enviar o aviso.');
    }

    const state = this.normalTicketAlertRepository.getByTicketId(ticket.id);
    const now = this.now();
    if (state?.last_sent_at && state.last_sent_at + ALERT_COOLDOWN_MS > now) {
      const seconds = Math.ceil((state.last_sent_at + ALERT_COOLDOWN_MS - now) / 1000);
      throw new TicketServiceError(`Aguarde ${seconds}s antes de avisar o autor novamente.`);
    }
    if (this.processing.has(ticket.id)) {
      throw new TicketServiceError('Já existe um aviso em andamento para este ticket.');
    }

    this.processing.add(ticket.id);
    try {
      const member = await guild.members.fetch(ticket.user_id).catch(() => null);
      const channelUrl = `https://discord.com/channels/${guild.id}/${channel.id}`;
      let delivery = 'dm';

      try {
        if (!member || typeof member.send !== 'function') {
          throw new Error('DM_UNAVAILABLE');
        }
        await member.send({
          content: `Seu ticket foi respondido em ${guild.name}.`,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Abrir ticket').setURL(channelUrl)
            ),
          ],
          allowedMentions: { parse: [] },
        });
      } catch (dmError) {
        delivery = 'channel';
        await channel.send({
          content: `<@${ticket.user_id}> seu ticket foi respondido.`,
          allowedMentions: { parse: [], users: [ticket.user_id], roles: [] },
        });
      }

      this.normalTicketAlertRepository.markSent({
        ticketId: ticket.id,
        guildId: ticket.guild_id,
        channelId: ticket.channel_id,
        ownerUserId: ticket.user_id,
        sentAt: now,
      });
      return { delivery };
    } catch (error) {
      if (error instanceof TicketServiceError) throw error;
      throw new TicketServiceError(`Não foi possível avisar o autor do ticket: ${error.message}`);
    } finally {
      this.processing.delete(ticket.id);
    }
  }
}

module.exports = { NormalTicketAlertService, ALERT_COOLDOWN_MS };
