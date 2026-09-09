'use strict';

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const customId = require('./customId');
const { MAX_OPTIONS_PER_GUILD } = require('../storage/panelOptionRepository');

const SCOPE = 'cfg';

function truncate(text, max) {
  if (!text) return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function canPublishSnapshot(config, options) {
  const hasNormal = options.length > 0;
  const hasEmail = Boolean(config.email_option_enabled);
  if (!config.publish_channel_id || (!hasNormal && !hasEmail)) return false;
  if (hasNormal && (!config.category_id || !config.support_role_id)) return false;
  if (hasEmail && !config.email_category_id) return false;
  return true;
}

function buildConfigPanel({ guildId, guildName, config, options }) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ⚙️ Configuração do Painel de Tickets\n-# Servidor: ${guildName}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Título do painel**\n${truncate(config.panel_title, 200)}`)
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'title', guildId))
          .setLabel('Editar título')
          .setStyle(ButtonStyle.Secondary)
      )
  );

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Descrição do painel**\n${truncate(config.panel_description, 300)}`
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'desc', guildId))
          .setLabel('Editar descrição')
          .setStyle(ButtonStyle.Secondary)
      )
  );

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Imagem do painel**\n${config.panel_image_url ? config.panel_image_url : '_Nenhuma imagem definida._'}`
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'image', guildId))
          .setLabel(config.panel_image_url ? 'Alterar imagem' : 'Definir imagem')
          .setStyle(ButtonStyle.Secondary)
      )
  );

  if (config.panel_image_url) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'image_remove', guildId))
          .setLabel('Remover imagem')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Domínio/URL do site**\n${config.site_domain ? config.site_domain : '_Não configurado (preparação para função futura)._'}\n`
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'domain', guildId))
          .setLabel(config.site_domain ? 'Alterar domínio' : 'Definir domínio')
          .setStyle(ButtonStyle.Secondary)
      )
  );

  if (config.site_domain) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'domain_remove', guildId))
          .setLabel('Remover domínio')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### 📧 Opção especial de verificação'));

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `**Status:** ${config.email_option_enabled ? 'Habilitada' : 'Desabilitada'}`,
            `**Título:** ${config.email_option_label}`,
            `**Descrição:** ${config.email_option_description}`,
            `**Categoria exclusiva:** ${config.email_category_id ? `<#${config.email_category_id}>` : '_Não configurada_'}`,
          ].join('\n')
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'email_opt', guildId))
          .setLabel('Editar título/descrição')
          .setStyle(ButtonStyle.Secondary)
      )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'email_opt_toggle', guildId))
        .setLabel(config.email_option_enabled ? 'Desabilitar opção' : 'Habilitar opção')
        .setStyle(config.email_option_enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    )
  );

  const emailCategorySelect = new ChannelSelectMenuBuilder()
    .setCustomId(customId.build(SCOPE, 'email_category', guildId))
    .setPlaceholder('Categoria exclusiva para tickets de e-mail')
    .addChannelTypes(ChannelType.GuildCategory);
  if (config.email_category_id) emailCategorySelect.setDefaultChannels(config.email_category_id);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(emailCategorySelect));

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### 🎫 Opções normais do menu (${options.length}/${MAX_OPTIONS_PER_GUILD})`
    )
  );

  if (options.length > 0) {
    const selectOptions = options.slice(0, 25).map((option) => ({
      label: option.label,
      value: option.id,
      description: option.description || undefined,
      emoji: option.emoji || undefined,
    }));
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(customId.build(SCOPE, 'opt_manage', guildId))
          .setPlaceholder('Selecione uma opção para editar ou remover')
          .addOptions(selectOptions)
      )
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('_Nenhuma opção normal cadastrada._'));
  }

  const totalPublicOptions = options.length + (config.email_option_enabled ? 1 : 0);

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'opt_add', guildId))
        .setLabel('Adicionar opção normal')
        .setStyle(ButtonStyle.Success)
        .setDisabled(totalPublicOptions >= MAX_OPTIONS_PER_GUILD)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### 📁 Destinos'));

  const categorySelect = new ChannelSelectMenuBuilder()
    .setCustomId(customId.build(SCOPE, 'category', guildId))
    .setPlaceholder('Categoria dos tickets normais')
    .addChannelTypes(ChannelType.GuildCategory);
  if (config.category_id) categorySelect.setDefaultChannels(config.category_id);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(categorySelect));

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(customId.build(SCOPE, 'role', guildId))
    .setPlaceholder('Cargo da equipe para tickets normais');
  if (config.support_role_id) roleSelect.setDefaultRoles(config.support_role_id);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect));

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(customId.build(SCOPE, 'channel', guildId))
    .setPlaceholder('Canal onde o painel público será publicado')
    .addChannelTypes(ChannelType.GuildText);
  if (config.publish_channel_id) channelSelect.setDefaultChannels(config.publish_channel_id);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect));

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'preview', guildId))
        .setLabel('Pré-visualizar painel')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'publish', guildId))
        .setLabel(config.panel_message_id ? 'Atualizar painel publicado' : 'Publicar painel')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canPublishSnapshot(config, options))
    )
  );

  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function buildOptionDetailView({ guildId, option }) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## 🎫 Opção: ${option.label}`,
        `**Descrição:** ${option.description || '_Nenhuma._'}`,
        `**Emoji:** ${option.emoji || '_Nenhum._'}`,
      ].join('\n')
    )
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'opt_edit', guildId, option.id))
        .setLabel('Editar')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'opt_remove_confirm', guildId, option.id))
        .setLabel('Remover')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'back', guildId))
        .setLabel('Voltar')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function buildOptionRemoveConfirmView({ guildId, option }) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ⚠️ Remover opção "${option.label}"?\nEsta ação não pode ser desfeita.`
    )
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'opt_remove', guildId, option.id))
        .setLabel('Confirmar remoção')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'back', guildId))
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function buildClosedPanelView() {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('✅ Painel de configuração fechado.'));
  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  buildConfigPanel,
  buildOptionDetailView,
  buildOptionRemoveConfirmView,
  buildClosedPanelView,
};
