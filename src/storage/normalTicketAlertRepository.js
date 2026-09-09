'use strict';

class NormalTicketAlertRepository {
  constructor(db) {
    this.db = db;
  }

  getByTicketId(ticketId) {
    return this.db.prepare('SELECT * FROM normal_ticket_alert_state WHERE ticket_id = ?').get(ticketId) || null;
  }

  markSent({ ticketId, guildId, channelId, ownerUserId, sentAt }) {
    this.db
      .prepare(
        `INSERT INTO normal_ticket_alert_state (ticket_id, guild_id, channel_id, owner_user_id, last_sent_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(ticket_id) DO UPDATE SET
           guild_id = excluded.guild_id,
           channel_id = excluded.channel_id,
           owner_user_id = excluded.owner_user_id,
           last_sent_at = excluded.last_sent_at,
           updated_at = datetime('now')`
      )
      .run(ticketId, guildId, channelId, ownerUserId, sentAt);
    return this.getByTicketId(ticketId);
  }

  clearTicket(ticketId) {
    this.db.prepare('DELETE FROM normal_ticket_alert_state WHERE ticket_id = ?').run(ticketId);
  }
}

module.exports = { NormalTicketAlertRepository };
