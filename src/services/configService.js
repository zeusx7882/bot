'use strict';

const validation = require('../domain/validation');
const { MAX_OPTIONS_PER_GUILD } = require('../storage/panelOptionRepository');

class ConfigService {
  constructor({ guildConfigRepository, panelOptionRepository }) {
    this.guildConfigRepository = guildConfigRepository;
    this.panelOptionRepository = panelOptionRepository;
  }

  getOrCreate(guildId) {
    const config = this.guildConfigRepository.ensure(guildId);
    const options = this.panelOptionRepository.list(guildId);
    return { config, options };
  }

  updateTitle(guildId, rawTitle) {
    const title = validation.validatePanelTitle(rawTitle);
    return this.guildConfigRepository.setTitle(guildId, title);
  }

  updateDescription(guildId, rawDescription) {
    const description = validation.validatePanelDescription(rawDescription);
    return this.guildConfigRepository.setDescription(guildId, description);
  }

  updateImage(guildId, rawUrl) {
    const url = validation.validateImageUrl(rawUrl);
    return this.guildConfigRepository.setImageUrl(guildId, url);
  }

  removeImage(guildId) {
    return this.guildConfigRepository.setImageUrl(guildId, null);
  }

  updateDomain(guildId, rawDomain) {
    const domain = validation.validateDomain(rawDomain);
    return this.guildConfigRepository.setDomain(guildId, domain);
  }

  removeDomain(guildId) {
    return this.guildConfigRepository.setDomain(guildId, null);
  }

  setCategory(guildId, categoryId) {
    return this.guildConfigRepository.setCategory(guildId, categoryId);
  }

  setEmailCategory(guildId, categoryId) {
    return this.guildConfigRepository.setEmailCategory(guildId, categoryId);
  }

  setSupportRole(guildId, role) {
    if (!role || role.id === guildId) {
      throw new validation.ValidationError('O cargo @everyone não pode ser usado como equipe de suporte.');
    }
    if (role.guild && role.guild.id !== guildId) {
      throw new validation.ValidationError('O cargo selecionado não pertence a este servidor.');
    }
    return this.guildConfigRepository.setSupportRole(guildId, role.id);
  }

  setPublishChannel(guildId, channelId) {
    return this.guildConfigRepository.setPublishChannel(guildId, channelId);
  }

  setPublishedMessage(guildId, channelId, messageId) {
    return this.guildConfigRepository.setPublishedMessage(guildId, channelId, messageId);
  }

  clearPublishedMessage(guildId) {
    return this.guildConfigRepository.clearPublishedMessage(guildId);
  }

  listOptions(guildId) {
    return this.panelOptionRepository.list(guildId);
  }

  getOption(guildId, optionId) {
    return this.panelOptionRepository.get(guildId, optionId);
  }

  addOption(guildId, { label, description, emoji }) {
    const validated = {
      label: validation.validateOptionLabel(label),
      description: validation.validateOptionDescription(description),
      emoji: validation.validateEmoji(emoji),
    };
    return this.panelOptionRepository.add(guildId, validated);
  }

  updateOption(guildId, optionId, { label, description, emoji }) {
    const patch = {};
    if (label !== undefined) patch.label = validation.validateOptionLabel(label);
    if (description !== undefined) patch.description = validation.validateOptionDescription(description);
    if (emoji !== undefined) patch.emoji = validation.validateEmoji(emoji);
    return this.panelOptionRepository.update(guildId, optionId, patch);
  }

  removeOption(guildId, optionId) {
    return this.panelOptionRepository.remove(guildId, optionId);
  }

  updateEmailOption(guildId, { label, description }) {
    const nextLabel = validation.validateOptionLabel(label);
    const nextDescription = validation.validateOptionDescription(description) || 'Abra um ticket de verificação de e-mail.';
    this.guildConfigRepository.setEmailOptionLabel(guildId, nextLabel);
    this.guildConfigRepository.setEmailOptionDescription(guildId, nextDescription);
    return this.guildConfigRepository.get(guildId);
  }

  setEmailOptionEnabled(guildId, enabled) {
    const currentOptions = this.panelOptionRepository.count(guildId);
    if (enabled && currentOptions >= MAX_OPTIONS_PER_GUILD) {
      throw new validation.ValidationError(
        `Não é possível habilitar a opção de e-mail com ${MAX_OPTIONS_PER_GUILD} opções normais ativas.`
      );
    }
    return this.guildConfigRepository.setEmailOptionEnabled(guildId, enabled);
  }

  canPublish(config, options) {
    const hasNormal = options.length > 0;
    const hasEmail = Boolean(config.email_option_enabled);
    if (!config.publish_channel_id || (!hasNormal && !hasEmail)) return false;
    if (hasNormal && (!config.category_id || !config.support_role_id)) return false;
    if (hasEmail && !config.email_category_id) return false;
    return true;
  }
}

module.exports = { ConfigService };
