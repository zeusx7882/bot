'use strict';

const crypto = require('node:crypto');

const MAX_OPTIONS_PER_GUILD = 25;

class PanelOptionRepository {
  constructor(db) {
    this.db = db;
  }

  list(guildId) {
    return this.db
      .prepare('SELECT * FROM panel_options WHERE guild_id = ? ORDER BY position ASC, created_at ASC')
      .all(guildId);
  }

  count(guildId) {
    const row = this.db
      .prepare('SELECT COUNT(*) AS total FROM panel_options WHERE guild_id = ?')
      .get(guildId);
    return row.total;
  }

  get(guildId, optionId) {
    return (
      this.db
        .prepare('SELECT * FROM panel_options WHERE guild_id = ? AND id = ?')
        .get(guildId, optionId) || null
    );
  }

  add(guildId, { label, description = null, emoji = null }) {
    const total = this.count(guildId);
    if (total >= MAX_OPTIONS_PER_GUILD) {
      throw new Error(`Limite de ${MAX_OPTIONS_PER_GUILD} opções por servidor atingido.`);
    }
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO panel_options (id, guild_id, label, description, emoji, position)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, guildId, label, description, emoji, total);
    return this.get(guildId, id);
  }

  update(guildId, optionId, { label, description, emoji }) {
    const existing = this.get(guildId, optionId);
    if (!existing) {
      throw new Error('Opção não encontrada para este servidor.');
    }
    const nextLabel = label !== undefined ? label : existing.label;
    const nextDescription = description !== undefined ? description : existing.description;
    const nextEmoji = emoji !== undefined ? emoji : existing.emoji;
    this.db
      .prepare(
        `UPDATE panel_options
         SET label = ?, description = ?, emoji = ?, updated_at = datetime('now')
         WHERE guild_id = ? AND id = ?`
      )
      .run(nextLabel, nextDescription, nextEmoji, guildId, optionId);
    return this.get(guildId, optionId);
  }

  remove(guildId, optionId) {
    const result = this.db
      .prepare('DELETE FROM panel_options WHERE guild_id = ? AND id = ?')
      .run(guildId, optionId);
    return result.changes > 0;
  }
}

module.exports = { PanelOptionRepository, MAX_OPTIONS_PER_GUILD };
