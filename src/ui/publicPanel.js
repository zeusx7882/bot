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
const { buildEmailPanelOption } = require('../domain/emailVerification');

const SCOPE = 'ticket';

function buildPublicPanel({ guildId, config, options }) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${config.panel_title}`));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(config.panel_description));

  if (config.panel_image_url) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(config.panel_image_url))
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());

  const allOptions = options.map((option) => ({
    label: option.label,
    value: option.id,
    description: option.description || undefined,
    emoji: option.emoji || undefined,
  }));

  const emailOption = buildEmailPanelOption(config);
  if (emailOption) {
    allOptions.push({
      label: emailOption.label,
      value: emailOption.id,
      description: emailOption.description || undefined,
      emoji: emailOption.emoji,
    });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(customId.build(SCOPE, 'open', guildId))
    .setPlaceholder('Selecione o motivo do seu ticket')
    .addOptions(allOptions.slice(0, 25));

  container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

module.exports = { buildPublicPanel };
