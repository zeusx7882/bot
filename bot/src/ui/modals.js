'use strict';

const { ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const customId = require('./customId');
const { LIMITS } = require('../domain/validation');
const { MAX_CREDENTIAL_INPUT } = require('../domain/emailVerification');

const SCOPE = 'cfg';
const DEFAULT_PAGE = 'appearance';

function textInputLabel({ label, customIdValue, style, required, value, maxLength, placeholder }) {
  const input = new TextInputBuilder().setCustomId(customIdValue).setStyle(style).setRequired(Boolean(required));
  if (value) input.setValue(value);
  if (maxLength) input.setMaxLength(maxLength);
  if (placeholder) input.setPlaceholder(placeholder);
  return new LabelBuilder().setLabel(label).setTextInputComponent(input);
}

function buildTitleModal(guildId, currentValue, page) {
  const pageId = page || DEFAULT_PAGE;
  return new ModalBuilder()
    .setCustomId(customId.build(SCOPE, 'title_submit', guildId, pageId))
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

function buildDescriptionModal(guildId, currentValue, page) {
  const pageId = page || DEFAULT_PAGE;
  return new ModalBuilder()
    .setCustomId(customId.build(SCOPE, 'desc_submit', guildId, pageId))
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

function buildImageModal(guildId, currentValue, page) {
  const pageId = page || DEFAULT_PAGE;
  return new ModalBuilder()
    .setCustomId(customId.build(SCOPE, 'image_submit', guildId, pageId))
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

function buildDomainModal(guildId, currentValue, page) {
  const pageId = page || DEFAULT_PAGE;
  return new ModalBuilder()
    .setCustomId(customId.build(SCOPE, 'domain_submit', guildId, pageId))
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

function buildOptionModal(guildId, page, { optionId = null, label, description, emoji } = {}) {
  const pageId = page || DEFAULT_PAGE;
  const action = optionId ? 'opt_edit_submit' : 'opt_add_submit';
  const args = optionId ? [optionId, pageId] : [pageId];
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

function buildEmailOptionModal(guildId, config, page) {
  const pageId = page || DEFAULT_PAGE;
  return new ModalBuilder()
    .setCustomId(customId.build(SCOPE, 'email_opt_submit', guildId, pageId))
    .setTitle('Editar opção Verificar e-mail')
    .addLabelComponents(
      textInputLabel({
        label: 'Título da opção',
        customIdValue: 'label',
        style: TextInputStyle.Short,
        required: true,
        value: config.email_option_label,
        maxLength: LIMITS.optionLabel,
      })
    )
    .addLabelComponents(
      textInputLabel({
        label: 'Descrição da opção',
        customIdValue: 'description',
        style: TextInputStyle.Short,
        required: true,
        value: config.email_option_description,
        maxLength: LIMITS.optionDescription,
      })
    )
    .addLabelComponents(
      textInputLabel({
        label: 'Título da mensagem no ticket',
        customIdValue: 'connect_title',
        style: TextInputStyle.Short,
        required: true,
        value: config.email_connect_title,
        maxLength: LIMITS.emailConnectTitle,
      })
    )
    .addLabelComponents(
      textInputLabel({
        label: 'Mensagem curta de conexão',
        customIdValue: 'connect_message',
        style: TextInputStyle.Short,
        required: true,
        value: config.email_connect_message,
        maxLength: LIMITS.emailConnectMessage,
      })
    )
    .addLabelComponents(
      textInputLabel({
        label: 'Mini tutorial (até 4 passos)',
        customIdValue: 'connect_tutorial',
        style: TextInputStyle.Paragraph,
        required: true,
        value: config.email_connect_tutorial,
        maxLength: LIMITS.emailConnectTutorial,
      })
    );
}

function buildEmailCredentialModal(guildId, sessionId, action = 'email_auth_submit') {
  return new ModalBuilder()
    .setCustomId(customId.build('ticket', action, guildId, sessionId))
    .setTitle('Verificar e-mail (IMAP)')
    .addLabelComponents(
      textInputLabel({
        label: 'Conta (email:senha ou email:senha:extra)',
        customIdValue: 'account',
        style: TextInputStyle.Paragraph,
        required: true,
        maxLength: MAX_CREDENTIAL_INPUT,
        placeholder: 'usuario@example.test:senha-ficticia:campo-ignorado',
      })
    );
}

module.exports = {
  buildTitleModal,
  buildDescriptionModal,
  buildImageModal,
  buildDomainModal,
  buildOptionModal,
  buildEmailOptionModal,
  buildEmailCredentialModal,
};
