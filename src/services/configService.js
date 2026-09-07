'use strict';

const validation = require('../domain/validation');

/**
 * Camada de serviço que aplica validação de negócio antes de delegar para os
 * repositórios de persistência. Mantém a lógica de domínio fora dos
 * manipuladores de interação do Discord.
 */
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

  /**
   * Define o cargo de suporte. Recusa o cargo @everyone (cujo id é igual ao
   * id da guild) e recusa cargos de outro servidor.
   */
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

  /**
   * Verifica se a configuração atual permite publicar o painel público:
   * exige ao menos uma opção válida, categoria, cargo de suporte e canal de
   * publicação configurados.
   */
  canPublish(config, options) {
    return Boolean(
      options.length > 0 && config.category_id && config.support_role_id && config.publish_channel_id
    );
  }
}

module.exports = { ConfigService };
