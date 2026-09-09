'use strict';

const crypto = require('node:crypto');

class TranscriptStore {
  constructor({ db, cryptoService, config, now = () => Date.now() }) {
    this.db = db;
    this.cryptoService = cryptoService;
    this.config = config;
    this.now = now;
  }

  ingest({ guildId, body }) {
    validateTranscriptBody(guildId, body);
    const normalized = normalizeTranscriptPayload(guildId, body);
    const payloadHash = this.cryptoService.hash(JSON.stringify({ owner: normalized.ownerDiscordId, payload: normalized.payload }));
    const existing = this.db.prepare('SELECT transcript_id, payload_hash FROM transcript_record WHERE guild_id = ? AND ticket_id = ?').get(guildId, normalized.ticketId) || null;
    if (existing) {
      if (existing.payload_hash !== payloadHash) {
        const error = new Error('Transcript já existe com conteúdo diferente.');
        error.code = 'conflict';
        throw error;
      }
      return { transcriptId: existing.transcript_id, url: `/transcripts/${existing.transcript_id}` };
    }
    const transcriptId = crypto.randomUUID();
    const encrypted = this.cryptoService.encryptJson(normalized.payload, `transcript:${transcriptId}`);
    this.db.prepare(
      `INSERT INTO transcript_record (
         transcript_id, guild_id, ticket_id, owner_user_id, title,
         transcript_created_at, payload_hash, ciphertext, iv, auth_tag, expires_at, imported_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      transcriptId,
      guildId,
      normalized.ticketId,
      normalized.ownerDiscordId,
      normalized.title,
      normalized.createdAt,
      payloadHash,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.authTag,
      this.now() + this.config.transcriptRetentionDays * 24 * 60 * 60 * 1000,
      this.now()
    );
    return { transcriptId, url: `/transcripts/${transcriptId}` };
  }

  listForViewer({ viewerUserId, staffByGuild, page = 1, pageSize = 20 }) {
    const allRows = this.db.prepare(
      `SELECT transcript_id, guild_id, ticket_id, owner_user_id, title, transcript_created_at
       FROM transcript_record
       WHERE expires_at >= ?
       ORDER BY transcript_created_at DESC`
    ).all(this.now());
    const rows = allRows.filter((row) => canViewTranscript(row, viewerUserId, staffByGuild));
    const offset = Math.max(0, (page - 1) * pageSize);
    return {
      items: rows.slice(offset, offset + pageSize).map((row) => ({
        transcriptId: row.transcript_id,
        guildId: row.guild_id,
        ticketId: row.ticket_id,
        ownerDiscordId: row.owner_user_id,
        title: row.title,
        createdAt: row.transcript_created_at,
      })),
      page,
      pageSize,
      total: rows.length,
    };
  }

  getForViewer({ transcriptId, viewerUserId, staffByGuild }) {
    const row = this.db.prepare('SELECT * FROM transcript_record WHERE transcript_id = ? AND expires_at >= ?').get(transcriptId, this.now()) || null;
    if (!row || !canViewTranscript(row, viewerUserId, staffByGuild)) {
      return null;
    }
    return {
      transcriptId: row.transcript_id,
      guildId: row.guild_id,
      ticketId: row.ticket_id,
      ownerDiscordId: row.owner_user_id,
      title: row.title,
      createdAt: row.transcript_created_at,
      payload: this.cryptoService.decryptJson({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      }, `transcript:${row.transcript_id}`),
    };
  }

  cleanupExpired() {
    this.db.prepare('DELETE FROM transcript_record WHERE expires_at < ?').run(this.now());
  }
}

function canViewTranscript(row, viewerUserId, staffByGuild) {
  if (row.owner_user_id === viewerUserId) return true;
  return (staffByGuild[row.guild_id] || []).includes(viewerUserId);
}

function validateTranscriptBody(guildId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Payload de transcript inválido.');
  if (body.guildId && String(body.guildId) !== guildId) throw new Error('guildId do corpo não pode divergir da rota.');
  if (body.ticketType && body.ticketType !== 'normal') throw new Error('Apenas tickets normais podem ser enviados ao site.');
  if (!/^\d{5,30}$/.test(String(body.ownerDiscordId || ''))) throw new Error('ownerDiscordId inválido.');
  if (!String(body.ticketId || '').trim()) throw new Error('ticketId inválido.');
  if (!String(body.title || '').trim()) throw new Error('title inválido.');
  if (!Array.isArray(body.messages) || body.messages.length > 2000) throw new Error('messages inválido.');
  for (const message of body.messages) {
    if (!message || typeof message !== 'object') throw new Error('Mensagem inválida.');
    if (message.attachments && !Array.isArray(message.attachments)) throw new Error('attachments inválidos.');
    for (const attachment of message.attachments || []) {
      const url = new URL(String(attachment.url || ''));
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('Anexo inválido.');
      }
    }
  }
}

function normalizeTranscriptPayload(guildId, body) {
  return {
    guildId,
    ticketId: String(body.ticketId),
    ownerDiscordId: String(body.ownerDiscordId),
    title: String(body.title).slice(0, 200),
    createdAt: Number.isFinite(body.createdAt) ? Math.trunc(body.createdAt) : Date.now(),
    payload: {
      partial: Boolean(body.partial),
      messages: body.messages.map((message) => ({
        id: String(message.id || ''),
        createdAt: Number.isFinite(message.createdAt) ? Math.trunc(message.createdAt) : Date.now(),
        author: {
          id: String(message.author?.id || ''),
          tag: String(message.author?.tag || 'desconhecido'),
          displayName: message.author?.displayName ? String(message.author.displayName) : null,
        },
        content: String(message.content || ''),
        embeds: Array.isArray(message.embeds)
          ? message.embeds.map((embed) => ({
              title: embed.title ? String(embed.title) : '',
              description: embed.description ? String(embed.description) : '',
              fields: Array.isArray(embed.fields)
                ? embed.fields.map((field) => ({ name: String(field.name || ''), value: String(field.value || '') }))
                : [],
              url: embed.url ? String(embed.url) : '',
            }))
          : [],
        attachments: Array.isArray(message.attachments)
          ? message.attachments.map((attachment) => ({
              name: String(attachment.name || ''),
              url: String(attachment.url || ''),
            }))
          : [],
      })),
    },
  };
}

module.exports = { TranscriptStore, validateTranscriptBody, normalizeTranscriptPayload };
