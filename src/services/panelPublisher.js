'use strict';

const { buildPublicPanel } = require('../ui/publicPanel');

/**
 * Publica (ou atualiza, se já publicado no mesmo canal) o painel público de
 * tickets. Se a mensagem publicada anteriormente tiver sido apagada, uma
 * nova é enviada automaticamente.
 */
async function publishPanel({ guild, config, options, configService }) {
  const channel = await guild.channels.fetch(config.publish_channel_id).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error('O canal configurado para publicação não existe mais ou não é um canal de texto.');
  }

  const payload = buildPublicPanel({ guildId: guild.id, config, options });

  if (config.panel_channel_id === channel.id && config.panel_message_id) {
    const existingMessage = await channel.messages.fetch(config.panel_message_id).catch(() => null);
    if (existingMessage) {
      const updated = await existingMessage.edit(payload);
      configService.setPublishedMessage(guild.id, channel.id, updated.id);
      return { channel, message: updated, updatedExisting: true };
    }
  }

  const message = await channel.send(payload);
  configService.setPublishedMessage(guild.id, channel.id, message.id);
  return { channel, message, updatedExisting: false };
}

module.exports = { publishPanel };
