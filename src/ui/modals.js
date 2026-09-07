'use strict';

const { ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const customId = require('./customId');
const { LIMITS } = require('../domain/validation');

const SCOPE = 'cfg';

function textInputLabel({ label, customIdValue, style, required, value, maxLength, placeholder }) {
  const input = new TextInputBuilder().setCustomId(customIdValue).setStyle(style).setRequired(Boolean(required));
  if (value) input.setValue(value);
  if (maxLength) input.setMaxLength(maxLength);
  if (placeholder) input.setPlaceholder(placeholder);
  return new LabelBuilder().setLabel(label).setTextInputComponent(input);
}

function buildTitleModal(guildId, currentValue) {
  return new ModalBuilder()
    .setCustomId(customId.build(SCOPE, 'title_submit', guildId))
    .setTitle('Editar título do painel')
    .addLabelComponents(
      textInputLabel({
        label: 'Título',
        customIdValue: 'value',
        style: TextInputStyle.Short,
        required: true,
        value: currentValue,
        maxLength: LIMITS.panelTitle,
      })
    );
}

function buildDescriptionModal(guildId, currentValue) {
  return new ModalBuilder()
    .setCustomId(customId.build(SCOPE, 'desc_submit', guildId))
    .setTitle('Editar descrição do painel')
    .addLabelComponents(
      textInputLabel({
        label: 'Descrição',
        customIdValue: 'value',
        style: TextInputStyle.Paragraph,
        required: true,
        value: currentValue,
        maxLength: LIMITS.panelDescription,
      })
    );
}

function buildImageModal(guildId, currentValue) {
  return new ModalBuilder()
    .setCustomId(customId.build(SCOPE, 'image_submit', guildId))
    .setTitle('Definir imagem do painel')
    .addLabelComponents(
      textInputLabel({
        label: 'URL da imagem (http/https)',
        customIdValue: 'value',
        style: TextInputStyle.Short,
        required: true,
        value: currentValue,
        placeholder: 'https://exemplo.com/imagem.png',
      })
    );
}

function buildDomainModal(guildId, currentValue) {
  return new ModalBuilder()
    .setCustomId(customId.build(SCOPE, 'domain_submit', guildId))
    .setTitle('Definir domínio/URL do site')
    .addLabelComponents(
      textInputLabel({
        label: 'Domínio ou URL (http/https)',
        customIdValue: 'value',
        style: TextInputStyle.Short,
        required: true,
        value: currentValue,
        maxLength: LIMITS.domain,
        placeholder: 'https://exemplo.com',
      })
    );
}

function buildOptionModal(guildId, { optionId = null, label, description, emoji } = {}) {
  const action = optionId ? 'opt_edit_submit' : 'opt_add_submit';
  const args = optionId ? [optionId] : [];
  const modal = new ModalBuilder()
    .setCustomId(customId.build(SCOPE, action, guildId, ...args))
    .setTitle(optionId ? 'Editar opção do menu' : 'Adicionar opção ao menu')
    .addLabelComponents(
      textInputLabel({
        label: 'Nome da opção',
        customIdValue: 'label',
        style: TextInputStyle.Short,
        required: true,
        value: label,
        maxLength: LIMITS.optionLabel,
      })
    )
    .addLabelComponents(
      textInputLabel({
        label: 'Descrição (opcional)',
        customIdValue: 'description',
        style: TextInputStyle.Short,
        required: false,
        value: description,
        maxLength: LIMITS.optionDescription,
      })
    )
    .addLabelComponents(
      textInputLabel({
        label: 'Emoji (opcional)',
        customIdValue: 'emoji',
        style: TextInputStyle.Short,
        required: false,
        value: emoji,
        maxLength: 32,
        placeholder: '🎫',
      })
    );
  return modal;
}

module.exports = {
  buildTitleModal,
  buildDescriptionModal,
  buildImageModal,
  buildDomainModal,
  buildOptionModal,
};
