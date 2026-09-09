'use strict';

const { AttachmentBuilder } = require('discord.js');
const { TicketServiceError } = require('./ticketService');

class NormalTicketClosureService {
  constructor({ ticketRepository, guildConfigRepository, ticketClosureJobRepository, transcriptService }) {
    this.ticketRepository = ticketRepository;
    this.guildConfigRepository = guildConfigRepository;
    this.ticketClosureJobRepository = ticketClosureJobRepository;
    this.transcriptService = transcriptService;
    this.processing = new Set();
    this.client = null;
    this.messageContentEnabled = false;
  }

  attachClient(client, { messageContentEnabled = false } = {}) {
    this.client = client;
    this.messageContentEnabled = messageContentEnabled;
  }

  async restorePending() {
    for (const job of this.ticketClosureJobRepository.listRetryable()) {
      await this._run(job.ticket_id);
    }
  }

  async closeTicket({ guildId, channelId, requestedByUserId }) {
    const ticket = this.ticketRepository.findByChannel(guildId, channelId);
    if (!ticket || ticket.ticket_type !== 'normal') {
      throw new TicketServiceError('Ticket normal não encontrado para encerramento.');
    }
    this.ticketRepository.markClosing(ticket.id);
    this.ticketClosureJobRepository.upsertPending({
      ticketId: ticket.id,
      guildId,
      channelId,
      requestedByUserId,
      requestedAt: Date.now(),
    });
    await this._run(ticket.id);
  }

  async _run(ticketId) {
    if (this.processing.has(ticketId)) return;
    this.processing.add(ticketId);
    try {
      const job = this.ticketClosureJobRepository.get(ticketId);
      if (!job) return;
      this.ticketClosureJobRepository.markProcessing(ticketId);

      const ticket = this.ticketRepository.getById(ticketId);
      if (!ticket || ticket.status === 'closed') {
        this.ticketClosureJobRepository.markDone(ticketId);
        return;
      }
      const guild = await this.client?.guilds.fetch(job.guild_id).catch(() => null);
      if (!guild) throw new TicketServiceError('Guild não encontrada para concluir encerramento.');
      const channel = await guild.channels.fetch(job.channel_id).catch(() => null);
      if (!channel) {
        this.ticketRepository.markClosed(ticketId);
        this.ticketClosureJobRepository.markDone(ticketId);
        return;
      }

      const config = this.guildConfigRepository.get(job.guild_id);
      const logsChannelId = config?.normal_logs_channel_id || null;
      let logMessageId = null;

      if (logsChannelId) {
        if (!this.messageContentEnabled) {
          throw new TicketServiceError(
            'Logs de transcript habilitados, mas Message Content Intent está desativado. Ative MESSAGE_CONTENT_INTENT=1 e o intent no Developer Portal.'
          );
        }
        const logsChannel = await guild.channels.fetch(logsChannelId).catch(() => null);
        if (!logsChannel || !logsChannel.isTextBased()) {
          throw new TicketServiceError('Canal de logs configurado não está acessível.');
        }
        const messages = await this.transcriptService.collectMessages(channel);
        const html = this.transcriptService.buildHtml({
          guildName: guild.name,
          channelName: channel.name || channel.id,
          ticket,
          messages: messages.slice(0, this.transcriptService.maxMessages),
          partial: messages.length > this.transcriptService.maxMessages,
        });
        const attachment = new AttachmentBuilder(Buffer.from(html, 'utf8'), {
          name: `ticket-${ticket.id}-transcript.html`,
        });
        const logMessage = await logsChannel.send({
          content: `📁 Ticket normal encerrado\nAutor: <@${ticket.user_id}>\nCanal: <#${job.channel_id}>`,
          files: [attachment],
          allowedMentions: { parse: [] },
        });
        logMessageId = logMessage.id;
      }

      await channel.delete('Ticket normal encerrado').catch((error) => {
        throw new TicketServiceError(`Falha ao excluir canal: ${error.message}`);
      });
      this.ticketRepository.markClosed(ticketId);
      this.ticketClosureJobRepository.markDone(ticketId, logMessageId);
    } catch (error) {
      this.ticketClosureJobRepository.markFailed(ticketId, error.message);
      throw error;
    } finally {
      this.processing.delete(ticketId);
    }
  }
}

module.exports = { NormalTicketClosureService };
