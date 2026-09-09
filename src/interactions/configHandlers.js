'use strict';

const { ValidationError } = require('../domain/validation');
const { AuthorizationError, assertGuildAdmin } = require('../utils/permissions');
const {
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

function currentPanelPayload(context, guildId, guildName) {
  const { config, options } = context.configService.getOrCreate(guildId);
  return buildConfigPanel({ guildId, guildName, config, options });
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

  switch (action) {
    case 'title': {
      const { config } = context.configService.getOrCreate(guildId);
      return interaction.showModal(modals.buildTitleModal(guildId, config.panel_title));
    }
    case 'desc': {
      const { config } = context.configService.getOrCreate(guildId);
      return interaction.showModal(modals.buildDescriptionModal(guildId, config.panel_description));
    }
    case 'image': {
      const { config } = context.configService.getOrCreate(guildId);
      return interaction.showModal(modals.buildImageModal(guildId, config.panel_image_url));
    }
    case 'domain': {
      const { config } = context.configService.getOrCreate(guildId);
      return interaction.showModal(modals.buildDomainModal(guildId, config.site_domain));
    }
    case 'email_opt': {
      const { config } = context.configService.getOrCreate(guildId);
      return interaction.showModal(modals.buildEmailOptionModal(guildId, config));
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
      return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name));
    }
    case 'image_remove': {
      await interaction.deferUpdate();
      context.configService.removeImage(guildId);
      return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name));
    }
    case 'domain_remove': {
      await interaction.deferUpdate();
      context.configService.removeDomain(guildId);
      return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name));
    }
    case 'opt_add':
      return interaction.showModal(modals.buildOptionModal(guildId));
    case 'opt_edit': {
      const optionId = args[0];
      const option = context.configService.getOption(guildId, optionId);
      if (!option) {
        await interaction.deferUpdate();
        return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name));
      }
      return interaction.showModal(modals.buildOptionModal(guildId, option));
    }
    case 'opt_remove_confirm': {
      const optionId = args[0];
      const option = context.configService.getOption(guildId, optionId);
      if (!option) {
        return interaction.update(currentPanelPayload(context, guildId, interaction.guild.name));
      }
      return interaction.update(buildOptionRemoveConfirmView({ guildId, option }));
    }
    case 'opt_remove': {
      const optionId = args[0];
      await interaction.deferUpdate();
      context.configService.removeOption(guildId, optionId);
      return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name));
    }
    case 'back':
      return interaction.update(currentPanelPayload(context, guildId, interaction.guild.name));
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
        return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name));
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
      return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name));
    }
    case 'close':
      return interaction.update(buildClosedPanelView());
    default:
      logger.warn(`Ação de botão de configuração desconhecida: ${action}`);
      return interaction.reply({ content: 'Ação desconhecida.', flags: MessageFlags.Ephemeral });
  }
});

const handleSelect = withGuard(async (interaction, parsed, context) => {
  const { action } = parsed;
  const guildId = parsed.guildId;

  if (action === 'opt_manage') {
    const optionId = interaction.values[0];
    const option = context.configService.getOption(guildId, optionId);
    if (!option) {
      return interaction.update(currentPanelPayload(context, guildId, interaction.guild.name));
    }
    return interaction.update(buildOptionDetailView({ guildId, option }));
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

  return interaction.editReply(currentPanelPayload(context, guildId, interaction.guild.name));
});

const handleModalSubmit = withGuard(async (interaction, parsed, context) => {
  const { action, args } = parsed;
  const guildId = parsed.guildId;

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

  const payload = currentPanelPayload(context, guildId, interaction.guild.name);
  if (interaction.isFromMessage && interaction.isFromMessage()) {
    return interaction.update(payload);
  }
  return interaction.reply(payload);
});

module.exports = { handleButton, handleSelect, handleModalSubmit };
