'use strict';

const {
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const customId = require('./customId');

const SCOPE = 'ticket';

/**
 * Monta o payload (Components V2) do painel público onde os usuários
 * selecionam uma opção para abrir um ticket.
 */
function buildPublicPanel({ guildId, config, options }) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${config.panel_title}`));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(config.panel_description));

  if (config.panel_image_url) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(config.panel_image_url)
      )
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(customId.build(SCOPE, 'open', guildId))
    .setPlaceholder('Selecione o motivo do seu ticket')
    .addOptions(
      options.map((option) => ({
        label: option.label,
        value: option.id,
        description: option.description || undefined,
        emoji: option.emoji || undefined,
      }))
    );

  container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

module.exports = { buildPublicPanel };
