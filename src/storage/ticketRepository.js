'use strict';

class DuplicateTicketError extends Error {
  constructor() {
    super('Já existe um ticket ativo para este usuário neste servidor.');
    this.name = 'DuplicateTicketError';
  }
}

class TicketRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Cria o registro do ticket em estado "creating" (funciona como um lock).
   * Se já existir um ticket ativo (creating/open) para o par guild+usuário,
   * a constraint UNIQUE do banco rejeita a inserção e lançamos
   * `DuplicateTicketError`. Isso garante que cliques concorrentes no mesmo
   * botão não criem dois canais.
   */
  createLock(guildId, userId, optionId, optionLabel) {
    try {
      const result = this.db
        .prepare(
          `INSERT INTO tickets (guild_id, user_id, option_id, option_label, status)
           VALUES (?, ?, ?, ?, 'creating')`
        )
        .run(guildId, userId, optionId, optionLabel);
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

  findActive(guildId, userId) {
    return (
      this.db
        .prepare(
          `SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status IN ('creating', 'open')`
        )
        .get(guildId, userId) || null
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

  /**
   * Libera o "lock" removendo o registro, permitindo uma nova tentativa.
   * Usado quando a criação do canal ou o envio da mensagem inicial falha.
   */
  releaseLock(id) {
    this.db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
  }

  /**
   * Remove um registro de ticket ativo cujo canal foi apagado manualmente,
   * permitindo que o usuário abra um novo ticket.
   */
  removeStale(id) {
    this.db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
  }
}

function isUniqueConstraintError(error) {
  return Boolean(error && typeof error.message === 'string' && error.message.includes('UNIQUE constraint failed'));
}

module.exports = { TicketRepository, DuplicateTicketError };
