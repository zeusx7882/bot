'use strict';

const crypto = require('node:crypto');
const { ValidationError } = require('../domain/validation');

const MODAL_TTL_MS = 120000;

class EmailSessionService {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.modalSessions = new Map();
    this.ticketCreds = new Map();
    this.cooldowns = new Map();
  }

  createModalSession({ guildId, userId, channelId = null }) {
    const id = crypto.randomBytes(6).toString('hex');
    this.modalSessions.set(id, {
      guildId,
      userId,
      channelId,
      expiresAt: this.now() + MODAL_TTL_MS,
    });
    return id;
  }

  consumeModalSession(id, { guildId, userId, channelId = null }) {
    const found = this.modalSessions.get(id);
    if (!found) throw new ValidationError('Esta solicitação expirou. Abra o modal novamente.');
    this.modalSessions.delete(id);

    if (found.expiresAt < this.now()) {
      throw new ValidationError('Esta solicitação expirou. Abra o modal novamente.');
    }
    if (found.guildId !== guildId || found.userId !== userId || found.channelId !== channelId) {
      throw new ValidationError('Esta solicitação não pertence a você ou a este canal.');
    }
  }

  setCredentials(ticketId, credentials) {
    this.ticketCreds.set(String(ticketId), {
      email: credentials.email,
      password: credentials.password,
      cachedAt: this.now(),
    });
  }

  getCredentials(ticketId) {
    return this.ticketCreds.get(String(ticketId)) || null;
  }

  clearCredentials(ticketId) {
    this.ticketCreds.delete(String(ticketId));
  }

  clearChannel(channelId) {
    const suffix = `:${channelId}`;
    for (const key of this.cooldowns.keys()) {
      if (key.endsWith(suffix)) this.cooldowns.delete(key);
    }
  }

  assertCooldown(key, ms) {
    const now = this.now();
    const until = this.cooldowns.get(key) || 0;
    if (until > now) {
      const seconds = Math.ceil((until - now) / 1000);
      throw new ValidationError(`Aguarde ${seconds}s antes de tentar novamente.`);
    }
    this.cooldowns.set(key, now + ms);
  }
}

module.exports = { EmailSessionService, MODAL_TTL_MS };
