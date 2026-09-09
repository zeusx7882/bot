'use strict';

class TicketClosureJobRepository {
  constructor(db) {
    this.db = db;
  }

  upsertPending({ ticketId, guildId, channelId, requestedByUserId, requestedAt }) {
    this.db
      .prepare(
        `INSERT INTO ticket_closure_job (ticket_id, guild_id, channel_id, requested_by_user_id, requested_at, status, attempts, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', 0, datetime('now'))
         ON CONFLICT(ticket_id) DO UPDATE SET
           guild_id = excluded.guild_id,
           channel_id = excluded.channel_id,
           requested_by_user_id = excluded.requested_by_user_id,
           requested_at = excluded.requested_at,
           status = 'pending',
           updated_at = datetime('now')`
      )
      .run(ticketId, guildId, channelId, requestedByUserId, requestedAt);
    return this.get(ticketId);
  }

  get(ticketId) {
    return this.db.prepare('SELECT * FROM ticket_closure_job WHERE ticket_id = ?').get(ticketId) || null;
  }

  listRetryable() {
    return this.db
      .prepare(`SELECT * FROM ticket_closure_job WHERE status IN ('pending', 'failed', 'processing') ORDER BY ticket_id ASC`)
      .all();
  }

  markProcessing(ticketId) {
    this.db
      .prepare(
        `UPDATE ticket_closure_job
         SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now')
         WHERE ticket_id = ?`
      )
      .run(ticketId);
  }

  markFailed(ticketId, message) {
    this.db
      .prepare(
        `UPDATE ticket_closure_job
         SET status = 'failed', last_error = ?, updated_at = datetime('now')
         WHERE ticket_id = ?`
      )
      .run(String(message || 'Erro desconhecido.'), ticketId);
  }

  markDone(ticketId, logMessageId = null) {
    this.db
      .prepare(
        `UPDATE ticket_closure_job
         SET status = 'done', log_message_id = ?, last_error = NULL, updated_at = datetime('now')
         WHERE ticket_id = ?`
      )
      .run(logMessageId, ticketId);
  }
}

module.exports = { TicketClosureJobRepository };
