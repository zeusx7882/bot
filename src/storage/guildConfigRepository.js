'use strict';

const DEFAULT_TITLE = 'Central de Atendimento';
const DEFAULT_DESCRIPTION = 'Selecione uma opção abaixo para abrir um ticket.';
const DEFAULT_EMAIL_OPTION_LABEL = 'Verificar e-mail';
const DEFAULT_EMAIL_OPTION_DESCRIPTION = 'Abra um ticket de verificação de e-mail.';

class GuildConfigRepository {
  constructor(db) {
    this.db = db;
  }

  ensure(guildId) {
    this.db
      .prepare(
        `INSERT INTO guild_config (guild_id, panel_title, panel_description)
         VALUES (?, ?, ?)
         ON CONFLICT(guild_id) DO NOTHING`
      )
      .run(guildId, DEFAULT_TITLE, DEFAULT_DESCRIPTION);
    return this.get(guildId);
  }

  get(guildId) {
    return this.db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId) || null;
  }

  setField(guildId, field, value) {
    if (!ALLOWED_FIELDS.has(field)) {
      throw new Error(`Campo de configuração inválido: ${field}`);
    }
    this.ensure(guildId);
    this.db
      .prepare(`UPDATE guild_config SET ${field} = ?, updated_at = datetime('now') WHERE guild_id = ?`)
      .run(value, guildId);
    return this.get(guildId);
  }

  setTitle(guildId, title) {
    return this.setField(guildId, 'panel_title', title);
  }

  setDescription(guildId, description) {
    return this.setField(guildId, 'panel_description', description);
  }

  setImageUrl(guildId, imageUrl) {
    return this.setField(guildId, 'panel_image_url', imageUrl);
  }

  setCategory(guildId, categoryId) {
    return this.setField(guildId, 'category_id', categoryId);
  }

  setEmailCategory(guildId, categoryId) {
    return this.setField(guildId, 'email_category_id', categoryId);
  }

  setSupportRole(guildId, roleId) {
    return this.setField(guildId, 'support_role_id', roleId);
  }

  setPublishChannel(guildId, channelId) {
    return this.setField(guildId, 'publish_channel_id', channelId);
  }

  setDomain(guildId, domain) {
    return this.setField(guildId, 'site_domain', domain);
  }

  setEmailOptionEnabled(guildId, enabled) {
    return this.setField(guildId, 'email_option_enabled', enabled ? 1 : 0);
  }

  setEmailOptionLabel(guildId, label) {
    return this.setField(guildId, 'email_option_label', label);
  }

  setEmailOptionDescription(guildId, description) {
    return this.setField(guildId, 'email_option_description', description);
  }

  setPublishedMessage(guildId, channelId, messageId) {
    this.ensure(guildId);
    this.db
      .prepare(
        `UPDATE guild_config
         SET panel_channel_id = ?, panel_message_id = ?, updated_at = datetime('now')
         WHERE guild_id = ?`
      )
      .run(channelId, messageId, guildId);
    return this.get(guildId);
  }

  clearPublishedMessage(guildId) {
    return this.setPublishedMessage(guildId, null, null);
  }
}

const ALLOWED_FIELDS = new Set([
  'panel_title',
  'panel_description',
  'panel_image_url',
  'category_id',
  'email_category_id',
  'support_role_id',
  'publish_channel_id',
  'site_domain',
  'email_option_enabled',
  'email_option_label',
  'email_option_description',
]);

module.exports = {
  GuildConfigRepository,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  DEFAULT_EMAIL_OPTION_LABEL,
  DEFAULT_EMAIL_OPTION_DESCRIPTION,
};
