'use strict';

class EmailResultMessageRepository {
  constructor(db) {
    this.db = db;
  }

  track({ ticketId, guildId, channelId, messageId, ownerUserId }) {
    this.db
      .prepare(
        `INSERT INTO email_result_message_state (message_id, ticket_id, guild_id, channel_id, owner_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           ticket_id = excluded.ticket_id,
           guild_id = excluded.guild_id,
           channel_id = excluded.channel_id,
           owner_user_id = excluded.owner_user_id`
      )
      .run(messageId, ticketId, guildId, channelId, ownerUserId);
    return this.getByMessage(guildId, channelId, messageId);
  }

  getByMessage(guildId, channelId, messageId) {
    return (
      this.db
        .prepare(
          `SELECT * FROM email_result_message_state
           WHERE guild_id = ? AND channel_id = ? AND message_id = ?`
        )
        .get(guildId, channelId, messageId) || null
    );
  }

  deleteByMessage(guildId, channelId, messageId) {
    this.db
      .prepare(
        `DELETE FROM email_result_message_state
         WHERE guild_id = ? AND channel_id = ? AND message_id = ?`
      )
      .run(guildId, channelId, messageId);
  }

  clearTicket(ticketId) {
    this.db.prepare('DELETE FROM email_result_message_state WHERE ticket_id = ?').run(ticketId);
  }
}

module.exports = { EmailResultMessageRepository };
