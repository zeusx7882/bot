'use strict';

class PaymentLinkRepository {
  constructor(db) {
    this.db = db;
  }

  getByOperationInteractionId(interactionId) {
    return (
      this.db
        .prepare('SELECT * FROM payment_link_state WHERE operation_interaction_id = ?')
        .get(interactionId) || null
    );
  }

  create(data) {
    const result = this.db
      .prepare(
        `INSERT INTO payment_link_state (
          guild_id, channel_id, message_id, creator_user_id, payment_link_id, name, description,
          amount_input, amount_unit, currency, gateway_method, status, payment_url, operation_interaction_id
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.guildId,
        data.channelId,
        data.creatorUserId,
        data.paymentLinkId,
        data.name,
        data.description || null,
        data.amountInput,
        data.amountUnit,
        data.currency,
        data.gatewayMethod,
        data.status,
        data.paymentUrl || null,
        data.operationInteractionId
      );
    return this.getById(result.lastInsertRowid);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM payment_link_state WHERE id = ?').get(id) || null;
  }

  getByGuildAndPaymentLinkId(guildId, paymentLinkId) {
    return (
      this.db
        .prepare('SELECT * FROM payment_link_state WHERE guild_id = ? AND payment_link_id = ?')
        .get(guildId, paymentLinkId) || null
    );
  }

  setMessageId(id, messageId) {
    this.db
      .prepare("UPDATE payment_link_state SET message_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(messageId, id);
    return this.getById(id);
  }

  updateStatusAndUrl(id, status, paymentUrl) {
    this.db
      .prepare(
        "UPDATE payment_link_state SET status = ?, payment_url = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(status, paymentUrl || null, id);
    return this.getById(id);
  }
}

module.exports = { PaymentLinkRepository };
