'use strict';

class DuplicateTicketError extends Error {
  constructor() {
    super('Já existe um ticket ativo deste tipo para este usuário neste servidor.');
    this.name = 'DuplicateTicketError';
  }
}

class TicketRepository {
  constructor(db) {
    this.db = db;
  }

  createLock(guildId, userId, optionId, optionLabel, ticketType = 'normal') {
    try {
      const result = this.db
        .prepare(
          `INSERT INTO tickets (guild_id, user_id, option_id, option_label, ticket_type, status)
           VALUES (?, ?, ?, ?, ?, 'creating')`
        )
        .run(guildId, userId, optionId, optionLabel, ticketType);
      return this.getById(result.lastInsertRowid);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateTicketError();
      }
      throw error;
    }
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) || null;
  }

  findActive(guildId, userId, ticketType = 'normal') {
    return (
      this.db
        .prepare(
          `SELECT * FROM tickets
           WHERE guild_id = ? AND user_id = ? AND ticket_type = ? AND status IN ('creating', 'open', 'closing')`
        )
        .get(guildId, userId, ticketType) || null
    );
  }

  findByChannel(guildId, channelId) {
    return (
      this.db
        .prepare('SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ?')
        .get(guildId, channelId) || null
    );
  }

  markOpen(id, channelId) {
    this.db
      .prepare(
        `UPDATE tickets SET status = 'open', channel_id = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(channelId, id);
    return this.getById(id);
  }

  markClosing(id) {
    this.db
      .prepare(`UPDATE tickets SET status = 'closing', updated_at = datetime('now') WHERE id = ?`)
      .run(id);
    return this.getById(id);
  }

  markClosed(id) {
    this.db
      .prepare(`UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id = ?`)
      .run(id);
    return this.getById(id);
  }

  releaseLock(id) {
    this.db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
  }

  removeStale(id) {
    this.db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
  }

  findOpenEmailTickets() {
    return this.db
      .prepare(
        `SELECT * FROM tickets
         WHERE ticket_type = 'email' AND status IN ('open', 'closing') AND channel_id IS NOT NULL`
      )
      .all();
  }
}

const SQLITE_CONSTRAINT_UNIQUE = 2067;

function isUniqueConstraintError(error) {
  if (!error) return false;
  if (error.errcode === SQLITE_CONSTRAINT_UNIQUE) return true;
  return typeof error.message === 'string' && error.message.includes('UNIQUE constraint failed');
}

module.exports = { TicketRepository, DuplicateTicketError };
