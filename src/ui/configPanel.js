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
const CONFIG_PAGE_IDS = {
  APPEARANCE: 'appearance',
  NORMALS: 'normals',
  EMAIL: 'email',
  PUBLISH: 'publish',
};
const CONFIG_PAGE_ORDER = [
  CONFIG_PAGE_IDS.APPEARANCE,
  CONFIG_PAGE_IDS.NORMALS,
  CONFIG_PAGE_IDS.EMAIL,
  CONFIG_PAGE_IDS.PUBLISH,
];
const CONFIG_PAGE_META = {
  [CONFIG_PAGE_IDS.APPEARANCE]: { label: 'Aparência', emoji: '🎨' },
  [CONFIG_PAGE_IDS.NORMALS]: { label: 'Tickets normais', emoji: '🎫' },
  [CONFIG_PAGE_IDS.EMAIL]: { label: 'Verificação de e-mail', emoji: '📧' },
  [CONFIG_PAGE_IDS.PUBLISH]: { label: 'Publicação', emoji: '🚀' },
};

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

function resolveConfigPage(page, fallback = CONFIG_PAGE_IDS.APPEARANCE) {
  return CONFIG_PAGE_ORDER.includes(page) ? page : fallback;
}

function pageFromAction(action, fallback = CONFIG_PAGE_IDS.APPEARANCE) {
  const map = {
    title: CONFIG_PAGE_IDS.APPEARANCE,
    desc: CONFIG_PAGE_IDS.APPEARANCE,
    image: CONFIG_PAGE_IDS.APPEARANCE,
    image_remove: CONFIG_PAGE_IDS.APPEARANCE,
    title_submit: CONFIG_PAGE_IDS.APPEARANCE,
    desc_submit: CONFIG_PAGE_IDS.APPEARANCE,
    image_submit: CONFIG_PAGE_IDS.APPEARANCE,
    opt_manage: CONFIG_PAGE_IDS.NORMALS,
    opt_add: CONFIG_PAGE_IDS.NORMALS,
    opt_edit: CONFIG_PAGE_IDS.NORMALS,
    opt_edit_submit: CONFIG_PAGE_IDS.NORMALS,
    opt_add_submit: CONFIG_PAGE_IDS.NORMALS,
    opt_remove_confirm: CONFIG_PAGE_IDS.NORMALS,
    opt_remove: CONFIG_PAGE_IDS.NORMALS,
    category: CONFIG_PAGE_IDS.NORMALS,
    role: CONFIG_PAGE_IDS.NORMALS,
    back: CONFIG_PAGE_IDS.NORMALS,
    email_opt: CONFIG_PAGE_IDS.EMAIL,
    email_opt_submit: CONFIG_PAGE_IDS.EMAIL,
    email_opt_toggle: CONFIG_PAGE_IDS.EMAIL,
    email_category: CONFIG_PAGE_IDS.EMAIL,
    domain: CONFIG_PAGE_IDS.PUBLISH,
    domain_submit: CONFIG_PAGE_IDS.PUBLISH,
    domain_remove: CONFIG_PAGE_IDS.PUBLISH,
    channel: CONFIG_PAGE_IDS.PUBLISH,
    preview: CONFIG_PAGE_IDS.PUBLISH,
    publish: CONFIG_PAGE_IDS.PUBLISH,
  };
  return map[action] || fallback;
}

function buildConfigPanel({ guildId, guildName, config, options, page = CONFIG_PAGE_IDS.APPEARANCE }) {
  const selectedPage = resolveConfigPage(page);
  const container = new ContainerBuilder();
  const selectedMeta = CONFIG_PAGE_META[selectedPage];
  const selectedPageIndex = CONFIG_PAGE_ORDER.indexOf(selectedPage) + 1;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        '## ⚙️ Configuração do Painel de Tickets',
        `-# Servidor: ${truncate(guildName, 120)}`,
        `-# Página ${selectedPageIndex}/${CONFIG_PAGE_ORDER.length}: ${selectedMeta.emoji} ${selectedMeta.label}`,
      ].join('\n')
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      ...CONFIG_PAGE_ORDER.map((pageId) =>
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'nav', guildId, pageId))
          .setLabel(CONFIG_PAGE_META[pageId].label)
          .setStyle(pageId === selectedPage ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(pageId === selectedPage)
      )
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  if (selectedPage === CONFIG_PAGE_IDS.APPEARANCE) {
    addAppearancePage(container, guildId, config, selectedPage);
  } else if (selectedPage === CONFIG_PAGE_IDS.NORMALS) {
    addNormalTicketsPage(container, guildId, config, options, selectedPage);
  } else if (selectedPage === CONFIG_PAGE_IDS.EMAIL) {
    addEmailPage(container, guildId, config, selectedPage);
  } else {
    addPublishPage(container, guildId, config, options, selectedPage);
  }

  return validateConfigPayload({
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [container],
    allowedMentions: { parse: [] },
  });
}

function addAppearancePage(container, guildId, config, page) {
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Título do painel**\n${truncate(config.panel_title, 200)}`)
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'title', guildId, page))
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
          .setCustomId(customId.build(SCOPE, 'desc', guildId, page))
          .setLabel('Editar descrição')
          .setStyle(ButtonStyle.Secondary)
      )
  );

  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Imagem do painel**\n${config.panel_image_url ? truncate(config.panel_image_url, 350) : '_Nenhuma imagem definida._'}`
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'image', guildId, page))
          .setLabel(config.panel_image_url ? 'Alterar imagem' : 'Definir imagem')
          .setStyle(ButtonStyle.Secondary)
      )
  );

  if (config.panel_image_url) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'image_remove', guildId, page))
          .setLabel('Remover imagem')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }
}

function addNormalTicketsPage(container, guildId, config, options, page) {
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### 🎫 Opções normais (${options.length}/${MAX_OPTIONS_PER_GUILD})`)
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
          .setCustomId(customId.build(SCOPE, 'opt_manage', guildId, page))
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
        .setCustomId(customId.build(SCOPE, 'opt_add', guildId, page))
        .setLabel('Adicionar opção normal')
        .setStyle(ButtonStyle.Success)
        .setDisabled(totalPublicOptions >= MAX_OPTIONS_PER_GUILD)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  const categorySelect = new ChannelSelectMenuBuilder()
    .setCustomId(customId.build(SCOPE, 'category', guildId, page))
    .setPlaceholder('Categoria dos tickets normais')
    .addChannelTypes(ChannelType.GuildCategory);
  if (config.category_id) categorySelect.setDefaultChannels(config.category_id);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(categorySelect));

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(customId.build(SCOPE, 'role', guildId, page))
    .setPlaceholder('Cargo da equipe para tickets normais');
  if (config.support_role_id) roleSelect.setDefaultRoles(config.support_role_id);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect));
}

function addEmailPage(container, guildId, config, page) {
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('### 📧 Verificação de e-mail'));
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `**Status:** ${config.email_option_enabled ? 'Habilitada' : 'Desabilitada'}`,
            `**Título:** ${truncate(config.email_option_label, 100)}`,
            `**Descrição:** ${truncate(config.email_option_description, 120)}`,
            `**Categoria exclusiva:** ${config.email_category_id ? `<#${config.email_category_id}>` : '_Não configurada_'}`,
          ].join('\n')
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'email_opt', guildId, page))
          .setLabel('Editar título/descrição')
          .setStyle(ButtonStyle.Secondary)
      )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'email_opt_toggle', guildId, page))
        .setLabel(config.email_option_enabled ? 'Desabilitar opção' : 'Habilitar opção')
        .setStyle(config.email_option_enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    )
  );

  const emailCategorySelect = new ChannelSelectMenuBuilder()
    .setCustomId(customId.build(SCOPE, 'email_category', guildId, page))
    .setPlaceholder('Categoria exclusiva para tickets de e-mail')
    .addChannelTypes(ChannelType.GuildCategory);
  if (config.email_category_id) emailCategorySelect.setDefaultChannels(config.email_category_id);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(emailCategorySelect));
}

function addPublishPage(container, guildId, config, options, page) {
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**Domínio/URL do site**\n${config.site_domain ? truncate(config.site_domain, 350) : '_Não configurado (preparação para função futura)._'}`
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'domain', guildId, page))
          .setLabel(config.site_domain ? 'Alterar domínio' : 'Definir domínio')
          .setStyle(ButtonStyle.Secondary)
      )
  );

  if (config.site_domain) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId.build(SCOPE, 'domain_remove', guildId, page))
          .setLabel('Remover domínio')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(customId.build(SCOPE, 'channel', guildId, page))
    .setPlaceholder('Canal onde o painel público será publicado')
    .addChannelTypes(ChannelType.GuildText);
  if (config.publish_channel_id) channelSelect.setDefaultChannels(config.publish_channel_id);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect));

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'preview', guildId, page))
        .setLabel('Pré-visualizar painel')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'publish', guildId, page))
        .setLabel(config.panel_message_id ? 'Atualizar painel publicado' : 'Publicar painel')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canPublishSnapshot(config, options))
    )
  );
}

function buildOptionDetailView({ guildId, option, page = CONFIG_PAGE_IDS.NORMALS }) {
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
        .setCustomId(customId.build(SCOPE, 'opt_edit', guildId, option.id, page))
        .setLabel('Editar')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'opt_remove_confirm', guildId, option.id, page))
        .setLabel('Remover')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'back', guildId, page))
        .setLabel('Voltar')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return validateConfigPayload({
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [container],
    allowedMentions: { parse: [] },
  });
}

function buildOptionRemoveConfirmView({ guildId, option, page = CONFIG_PAGE_IDS.NORMALS }) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ⚠️ Remover opção "${option.label}"?\nEsta ação não pode ser desfeita.`
    )
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'opt_remove', guildId, option.id, page))
        .setLabel('Confirmar remoção')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(customId.build(SCOPE, 'back', guildId, page))
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return validateConfigPayload({
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [container],
    allowedMentions: { parse: [] },
  });
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

function validateConfigPayload(payload) {
  if (payload.content !== undefined || payload.embeds !== undefined) {
    throw new Error('Payload Components V2 inválido: não use content/embeds no painel de configuração.');
  }
  const totalComponents = countSerializedComponents(payload.components);
  if (totalComponents > 40) {
    throw new Error(`Payload Components V2 excede o limite de 40 componentes (${totalComponents}).`);
  }
  return payload;
}

function countSerializedComponents(payloadComponents) {
  const normalized = serialize(payloadComponents);
  return countComponentTree(normalized);
}

function serialize(value) {
  if (Array.isArray(value)) return value.map((item) => serialize(item));
  if (!value || typeof value !== 'object') return value;
  if (typeof value.toJSON === 'function') return serialize(value.toJSON());
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = serialize(nested);
  }
  return output;
}

function countComponentTree(node) {
  if (!node) return 0;
  if (Array.isArray(node)) return node.reduce((sum, item) => sum + countComponentTree(item), 0);
  if (typeof node !== 'object') return 0;
  const self = Number.isInteger(node.type) ? 1 : 0;
  const children = Array.isArray(node.components) ? countComponentTree(node.components) : 0;
  const accessory = node.accessory ? countComponentTree(node.accessory) : 0;
  return self + children + accessory;
}

module.exports = {
  CONFIG_PAGE_IDS,
  resolveConfigPage,
  pageFromAction,
  countSerializedComponents,
  buildConfigPanel,
  buildOptionDetailView,
  buildOptionRemoveConfirmView,
  buildClosedPanelView,
};
