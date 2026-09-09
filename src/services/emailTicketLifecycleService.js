'use strict';

const { INACTIVITY_TIMEOUT_MS, CLOSE_TIMEOUT_MS } = require('../domain/emailVerification');
const { logger } = require('../utils/logger');
const { buildInfoMessage } = require('../ui/ticketMessage');

class EmailTicketLifecycleService {
  constructor({ ticketRepository, emailTicketRepository, emailResultMessageRepository = null, sessionService, now = () => Date.now() }) {
    this.ticketRepository = ticketRepository;
    this.emailTicketRepository = emailTicketRepository;
    this.emailResultMessageRepository = emailResultMessageRepository;
    this.sessionService = sessionService;
    this.now = now;
    this.client = null;
    this.inactivityTimers = new Map();
    this.closeTimers = new Map();
  }

  attachClient(client) {
    this.client = client;
  }

  restoreSchedules() {
    const states = this.emailTicketRepository.listActive();
    for (const state of states) {
      this._scheduleInactivity(state.ticket_id, state.inactivity_deadline_at);
      if (state.close_deadline_at) {
        this._scheduleClose(state.ticket_id, state.close_deadline_at, 'Encerramento retomado após reinício.');
      }
    }
  }

  registerEmailTicketOpen(ticket, now = this.now()) {
    const deadline = now + INACTIVITY_TIMEOUT_MS;
    this.emailTicketRepository.createState({
      ticketId: ticket.id,
      guildId: ticket.guild_id,
      channelId: ticket.channel_id,
      ownerUserId: ticket.user_id,
      inactivityDeadlineAt: deadline,
      now,
    });
    this._scheduleInactivity(ticket.id, deadline);
    return deadline;
  }

  touchOwnerActivity(ticketId, now = this.now()) {
    const deadline = now + INACTIVITY_TIMEOUT_MS;
    const state = this.emailTicketRepository.touchActivity(ticketId, now, deadline);
    this._scheduleInactivity(ticketId, deadline);
    return state;
  }

  beginClosing(ticketId, reason, now = this.now()) {
    const deadline = now + CLOSE_TIMEOUT_MS;
    this.ticketRepository.markClosing(ticketId);
    this.emailTicketRepository.setCloseDeadline(ticketId, deadline);
    this._scheduleClose(ticketId, deadline, reason);
    return deadline;
  }

  clearTicket(ticketId) {
    clearTimer(this.inactivityTimers, ticketId);
    clearTimer(this.closeTimers, ticketId);
    this.emailTicketRepository.clear(ticketId);
    this.emailResultMessageRepository?.clearTicket(ticketId);
    this.sessionService.clearCredentials(ticketId);
  }

  async _onInactivity(ticketId) {
    const state = this.emailTicketRepository.getByTicketId(ticketId);
    if (!state) return;
    const ticket = this.ticketRepository.getById(ticketId);
    if (!ticket || ticket.status !== 'open') return;

    if (state.inactivity_deadline_at > this.now()) {
      this._scheduleInactivity(ticketId, state.inactivity_deadline_at);
      return;
    }

    await this._sendChannelMessage(state, '⏱️ Ticket de e-mail inativo por 6 minutos. Canal será encerrado em 30 segundos.');
    this.beginClosing(ticketId, 'Fechado por inatividade.');
  }

  async _onClose(ticketId, reason) {
    const state = this.emailTicketRepository.getByTicketId(ticketId);
    if (!state) return;
    const ticket = this.ticketRepository.getById(ticketId);
    if (!ticket || (ticket.status !== 'open' && ticket.status !== 'closing')) {
      this.clearTicket(ticketId);
      return;
    }

    if (state.close_deadline_at && state.close_deadline_at > this.now()) {
      this._scheduleClose(ticketId, state.close_deadline_at, reason);
      return;
    }

    const channel = await this._fetchChannel(state.guild_id, state.channel_id);
    if (channel) {
      await channel.delete(reason).catch((error) => {
        logger.error('Falha ao excluir canal de ticket de e-mail', new Error(error.message));
      });
    }

    this.ticketRepository.markClosed(ticketId);
    this.clearTicket(ticketId);
  }

  async _sendChannelMessage(state, text) {
    const channel = await this._fetchChannel(state.guild_id, state.channel_id);
    if (!channel || !channel.isTextBased()) return;
    await channel.send(buildInfoMessage(text)).catch(() => {});
  }

  async _fetchChannel(guildId, channelId) {
    if (!this.client) return null;
    const guild = await this.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return null;
    return guild.channels.fetch(channelId).catch(() => null);
  }

  _scheduleInactivity(ticketId, deadline) {
    clearTimer(this.inactivityTimers, ticketId);
    const delay = Math.max(0, deadline - this.now());
    const timer = setTimeout(() => {
      this._onInactivity(ticketId).catch(() => {});
    }, delay);
    this.inactivityTimers.set(ticketId, timer);
  }

  _scheduleClose(ticketId, deadline, reason) {
    clearTimer(this.closeTimers, ticketId);
    const delay = Math.max(0, deadline - this.now());
    const timer = setTimeout(() => {
      this._onClose(ticketId, reason).catch(() => {});
    }, delay);
    this.closeTimers.set(ticketId, timer);
  }
}

function clearTimer(map, key) {
  const timer = map.get(key);
  if (timer) {
    clearTimeout(timer);
    map.delete(key);
  }
}

module.exports = { EmailTicketLifecycleService };
