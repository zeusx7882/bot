'use strict';

const { ValidationError } = require('../domain/validation');
const { AuthorizationError, assertGuildAdmin } = require('../utils/permissions');
const {
  CONFIG_PAGE_IDS,
  resolveConfigPage,
  pageFromAction,
  buildConfigPanel,
  buildOptionDetailView,
  buildOptionRemoveConfirmView,
  buildClosedPanelView,
} = require('../ui/configPanel');
const { buildPublicPanel } = require('../ui/publicPanel');
const modals = require('../ui/modals');
const { publishPanel } = require('../services/panelPublisher');
const { logger } = require('../utils/logger');
const { MessageFlags } = require('discord.js');

function currentPanelPayload(context, guildId, guildName, page) {
  const { config, options } = context.configService.getOrCreate(guildId);
  return buildConfigPanel({ guildId, guildName, config, options, page });
}

async function guard(interaction, expectedGuildId) {
  await assertGuildAdmin(interaction, expectedGuildId);
}

async function replyAuthError(interaction, error) {
  const payload = { content: error.message, flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

function withGuard(handler) {
  return async (interaction, parsed, context) => {
    try {
      await guard(interaction, parsed.guildId);
    } catch (error) {
      if (error instanceof AuthorizationError) return replyAuthError(interaction, error);
      throw error;
    }
    return handler(interaction, parsed, context);
  };
}

const handleButton = withGuard(async (interaction, parsed, context) => {
  const { action, args } = parsed;
  const guildId = parsed.guildId;
  const page = parseActionPage(action, args);

  switch (action) {
    case 'nav': {
      const targetPage = parseActionPage(action, args);
      return interaction.update(currentPanelPayload(context, guildId, interaction.guild.name, targetPage));
    }
    case 'title': {
      const { config } = context.configService.getOrCreate(guildId);
      return interaction.showModal(modals.buildTitleModal(guildId, config.panel_title, page));
    }
    case 'desc': {
      const { config } = context.configService.getOrCreate(guildId);
      return interaction.showModal(modals.buildDescriptionModal(guildId, config.panel_description, page));
    }
    case 'image': {
      const { config } = context.configService.getOrCreate(guildId);
      return interaction.showModal(modals.buildImageModal(guildId, config.panel_image_url, page));
    }
    case 'domain': {
      const { config } = context.configService.getOrCreate(guildId);
      return interaction.showModal(modals.buildDomainModal(guildId, config.site_domain, page));
    }
    case 'email_opt': {
      const { config } = context.configService.getOrCreate(guildId);
      return interaction.showModal(modals.buildEmailOptionModal(guildId, config, page));
    }
    case 'email_opt_toggle': {
      await interaction.deferUpdate();
      try {
        const { config } = context.configService.getOrCreate(guildId);
        context.configService.setEmailOptionEnabled(guildId, !config.email_option_enabled);
      } catch (error) {
        if (error instanceof ValidationError) {
          await interaction.followUp({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
        } else {
          throw error;
        }
      }
      return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name, page));
    }
    case 'image_remove': {
      await interaction.deferUpdate();
      context.configService.removeImage(guildId);
      return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name, page));
    }
    case 'domain_remove': {
      await interaction.deferUpdate();
      context.configService.removeDomain(guildId);
      return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name, page));
    }
    case 'normal_logs_remove': {
      await interaction.deferUpdate();
      context.configService.setNormalLogsChannel(guildId, null);
      return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name, page));
    }
    case 'opt_add':
      return interaction.showModal(modals.buildOptionModal(guildId, page));
    case 'opt_edit': {
      const optionId = args[0] || '';
      const option = context.configService.getOption(guildId, optionId);
      if (!option) {
        await interaction.deferUpdate();
        return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name, page));
      }
      return interaction.showModal(modals.buildOptionModal(guildId, page, { optionId: option.id, ...option }));
    }
    case 'opt_remove_confirm': {
      const optionId = args[0] || '';
      const option = context.configService.getOption(guildId, optionId);
      if (!option) {
        return interaction.update(currentPanelPayload(context, guildId, interaction.guild.name, page));
      }
      return interaction.update(buildOptionRemoveConfirmView({ guildId, option, page }));
    }
    case 'opt_remove': {
      const optionId = args[0] || '';
      await interaction.deferUpdate();
      context.configService.removeOption(guildId, optionId);
      return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name, page));
    }
    case 'back':
      return interaction.update(currentPanelPayload(context, guildId, interaction.guild.name, page));
    case 'preview': {
      const { config, options } = context.configService.getOrCreate(guildId);
      if (options.length === 0 && !config.email_option_enabled) {
        return interaction.reply({
          content: 'Adicione ao menos uma opção antes de pré-visualizar o painel.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const preview = buildPublicPanel({ guildId, config, options });
      return interaction.reply({ ...preview, flags: preview.flags | MessageFlags.Ephemeral });
    }
    case 'publish': {
      await interaction.deferUpdate();
      const { config, options } = context.configService.getOrCreate(guildId);
      if (!context.configService.canPublish(config, options)) {
        await interaction.followUp({
          content:
            'Não é possível publicar: configure ao menos uma opção ativa e seus destinos obrigatórios (normal e/ou e-mail).',
          flags: MessageFlags.Ephemeral,
        });
        return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name, page));
      }
      try {
        await publishPanel({ guild: interaction.guild, config, options, configService: context.configService });
        await interaction.followUp({ content: '✅ Painel publicado/atualizado com sucesso.', flags: MessageFlags.Ephemeral });
      } catch (error) {
        logger.error('Falha ao publicar painel', error);
        await interaction.followUp({
          content: `❌ Não foi possível publicar o painel: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name, page));
    }
    case 'close':
      return interaction.update(buildClosedPanelView());
    default:
      logger.warn(`Ação de botão de configuração desconhecida: ${action}`);
      return interaction.reply({ content: 'Ação desconhecida.', flags: MessageFlags.Ephemeral });
  }
});

const handleSelect = withGuard(async (interaction, parsed, context) => {
  const { action, args } = parsed;
  const guildId = parsed.guildId;
  const page = parseActionPage(action, args);

  if (action === 'opt_manage') {
    const optionId = interaction.values[0];
    const option = context.configService.getOption(guildId, optionId);
    if (!option) {
      return interaction.update(currentPanelPayload(context, guildId, interaction.guild.name, page));
    }
    return interaction.update(buildOptionDetailView({ guildId, option, page }));
  }

  await interaction.deferUpdate();

  try {
    if (action === 'category') {
      const category = interaction.channels.first();
      context.configService.setCategory(guildId, category ? category.id : null);
    } else if (action === 'email_category') {
      const category = interaction.channels.first();
      context.configService.setEmailCategory(guildId, category ? category.id : null);
    } else if (action === 'role') {
      const role = interaction.roles.first();
      context.configService.setSupportRole(guildId, role);
    } else if (action === 'channel') {
      const channel = interaction.channels.first();
      context.configService.setPublishChannel(guildId, channel ? channel.id : null);
    } else if (action === 'normal_logs_channel') {
      const channel = interaction.channels.first();
      context.configService.setNormalLogsChannel(guildId, channel ? channel.id : null);
    } else {
      logger.warn(`Ação de select de configuração desconhecida: ${action}`);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      await interaction.followUp({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    } else {
      throw error;
    }
  }

  return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name, page));
});

const handleModalSubmit = withGuard(async (interaction, parsed, context) => {
  const { action, args } = parsed;
  const guildId = parsed.guildId;
  const page = parseActionPage(action, args);

  try {
    if (action === 'title_submit') {
      context.configService.updateTitle(guildId, interaction.fields.getTextInputValue('value'));
    } else if (action === 'desc_submit') {
      context.configService.updateDescription(guildId, interaction.fields.getTextInputValue('value'));
    } else if (action === 'image_submit') {
      context.configService.updateImage(guildId, interaction.fields.getTextInputValue('value'));
    } else if (action === 'domain_submit') {
      context.configService.updateDomain(guildId, interaction.fields.getTextInputValue('value'));
    } else if (action === 'email_opt_submit') {
      context.configService.updateEmailOption(guildId, {
        label: interaction.fields.getTextInputValue('label'),
        description: interaction.fields.getTextInputValue('description'),
      });
      context.configService.updateEmailConnectCopy(guildId, {
        title: interaction.fields.getTextInputValue('connect_title'),
        message: interaction.fields.getTextInputValue('connect_message'),
        tutorial: interaction.fields.getTextInputValue('connect_tutorial'),
      });
    } else if (action === 'opt_add_submit') {
      context.configService.addOption(guildId, {
        label: interaction.fields.getTextInputValue('label'),
        description: interaction.fields.getTextInputValue('description'),
        emoji: interaction.fields.getTextInputValue('emoji'),
      });
    } else if (action === 'opt_edit_submit') {
      const optionId = args[0];
      context.configService.updateOption(guildId, optionId, {
        label: interaction.fields.getTextInputValue('label'),
        description: interaction.fields.getTextInputValue('description'),
        emoji: interaction.fields.getTextInputValue('emoji'),
      });
    } else {
      logger.warn(`Ação de modal de configuração desconhecida: ${action}`);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
    throw error;
  }

  const payload = currentPanelPayload(context, guildId, interaction.guild.name, page);
  if (interaction.isFromMessage && interaction.isFromMessage()) {
    return interaction.update(payload);
  }
  return interaction.reply(payload);
});

function parseActionPage(action, args) {
  if (action === 'nav') return resolveConfigPage(args[0], CONFIG_PAGE_IDS.APPEARANCE);
  const usesOptionAsFirstArg = action.startsWith('opt_') && action !== 'opt_add' && action !== 'opt_add_submit' && action !== 'opt_manage';
  const pageArg = usesOptionAsFirstArg ? args[1] : args[0];
  return resolveConfigPage(pageArg, pageFromAction(action, CONFIG_PAGE_IDS.APPEARANCE));
}

module.exports = { handleButton, handleSelect, handleModalSubmit };
