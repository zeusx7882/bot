'use strict';

class EmailTicketRepository {
  constructor(db) {
    this.db = db;
  }

  createState({ ticketId, guildId, channelId, ownerUserId, inactivityDeadlineAt, now }) {
    this.db
      .prepare(
        `INSERT INTO email_ticket_state (
          ticket_id, guild_id, channel_id, owner_user_id,
          inactivity_deadline_at, last_owner_activity_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(ticketId, guildId, channelId, ownerUserId, inactivityDeadlineAt, now);
    return this.getByTicketId(ticketId);
  }

  getByTicketId(ticketId) {
    return this.db.prepare('SELECT * FROM email_ticket_state WHERE ticket_id = ?').get(ticketId) || null;
  }

  getByChannel(guildId, channelId) {
    return (
      this.db
        .prepare('SELECT * FROM email_ticket_state WHERE guild_id = ? AND channel_id = ?')
        .get(guildId, channelId) || null
    );
  }

  listActive() {
    return this.db
      .prepare('SELECT * FROM email_ticket_state WHERE inactivity_deadline_at IS NOT NULL OR close_deadline_at IS NOT NULL')
      .all();
  }

  touchActivity(ticketId, now, nextDeadline) {
    this.db
      .prepare(
        `UPDATE email_ticket_state
         SET last_owner_activity_at = ?, inactivity_deadline_at = ?, updated_at = datetime('now')
         WHERE ticket_id = ?`
      )
      .run(now, nextDeadline, ticketId);
    return this.getByTicketId(ticketId);
  }

  setCloseDeadline(ticketId, deadlineAt) {
    this.db
      .prepare(
        `UPDATE email_ticket_state
         SET close_deadline_at = ?, updated_at = datetime('now')
         WHERE ticket_id = ?`
      )
      .run(deadlineAt, ticketId);
    return this.getByTicketId(ticketId);
  }

  setMailProgress(ticketId, uidValidity, lastSeenUid, verifiedAt) {
    this.db
      .prepare(
        `UPDATE email_ticket_state
         SET uid_validity = ?, last_seen_uid = ?, last_verify_at = ?, updated_at = datetime('now')
         WHERE ticket_id = ?`
      )
      .run(uidValidity, lastSeenUid, verifiedAt, ticketId);
    return this.getByTicketId(ticketId);
  }

  incrementLoginAttempt(ticketId, blockedUntil) {
    this.db
      .prepare(
        `UPDATE email_ticket_state
         SET login_attempt_count = login_attempt_count + 1,
             login_blocked_until = ?,
             updated_at = datetime('now')
         WHERE ticket_id = ?`
      )
      .run(blockedUntil, ticketId);
    return this.getByTicketId(ticketId);
  }

  clear(ticketId) {
    this.db.prepare('DELETE FROM email_ticket_state WHERE ticket_id = ?').run(ticketId);
  }
}

module.exports = { EmailTicketRepository };
