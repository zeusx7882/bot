'use strict';

const { escapeMarkdown } = require('discord.js');
const { ValidationError } = require('./validation');

const EMAIL_OPTION_ID = '__email_verify_option__';
const INACTIVITY_TIMEOUT_MS = 360000;
const CLOSE_TIMEOUT_MS = 30000;
const VERIFY_COOLDOWN_MS = 5000;
const MAX_CREDENTIAL_INPUT = 600;
const MAX_EMAIL_BODY_CHARS = 3500;
const DEFAULT_EMAIL_CONNECT_TITLE = 'Conectado à caixa de correio com sucesso';
const DEFAULT_EMAIL_CONNECT_MESSAGE = 'A autenticação foi concluída. Use o botão **Verificar** para buscar o último e-mail da INBOX sob demanda.';
const DEFAULT_EMAIL_CONNECT_TUTORIAL = [
  '1. Clique em **Verificar** para ler a mensagem mais recente (inclusive recebida antes da abertura).',
  '2. Novos cliques trazem apenas novas mensagens por UID/UIDVALIDITY, sem duplicar.',
  '3. Use **Mostrar conta para copiar** para visualizar e-mail:senha no chat efêmero.',
  '4. Clique em **Encerrar** para fechar este ticket com segurança.',
].join('\n');

function buildEmailPanelOption(config) {
  if (!config.email_option_enabled) return null;
  return {
    id: EMAIL_OPTION_ID,
    label: config.email_option_label,
    description: config.email_option_description || null,
    emoji: '📧',
    isEmailOption: true,
  };
}

function parseCredentialInput(rawValue) {
  if (typeof rawValue !== 'string') {
    throw new ValidationError('Entrada inválida.');
  }
  if (rawValue.length === 0 || rawValue.length > MAX_CREDENTIAL_INPUT) {
    throw new ValidationError('A entrada de credenciais está vazia ou excede o tamanho permitido.');
  }
  if (rawValue.includes('\n') || rawValue.includes('\r')) {
    throw new ValidationError('Use apenas uma linha no formato email:senha ou email:senha:extra.');
  }

  const firstColon = rawValue.indexOf(':');
  if (firstColon <= 0) {
    throw new ValidationError('Formato inválido. Use email:senha ou email:senha:extra.');
  }

  const secondColon = rawValue.indexOf(':', firstColon + 1);
  const email = rawValue.slice(0, firstColon);
  const password = secondColon === -1 ? rawValue.slice(firstColon + 1) : rawValue.slice(firstColon + 1, secondColon);

  if (!email || !password) {
    throw new ValidationError('E-mail e senha são obrigatórios.');
  }

  if (!isLikelyEmail(email)) {
    throw new ValidationError('E-mail inválido.');
  }

  return { email, password };
}

function enforceAllowedDomain(email, allowedDomains) {
  const domain = String(email.split('@')[1] || '').toLowerCase();
  if (!domain || !allowedDomains.includes(domain)) {
    throw new ValidationError('Este domínio de e-mail não é permitido neste servidor.');
  }
  return domain;
}

function sanitizeEmailText(text) {
  const value = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\u0000/g, '');
  const escaped = escapeMarkdown(value, { codeBlock: true, inlineCode: true, bold: true, italic: true, underscore: true, strikethrough: true, spoiler: true });
  if (escaped.length <= MAX_EMAIL_BODY_CHARS) return { text: escaped, truncated: false };
  return { text: `${escaped.slice(0, MAX_EMAIL_BODY_CHARS - 1)}…`, truncated: true };
}

function extractHttpLinks(text) {
  const source = String(text || '');
  const links = [];
  const seen = new Set();
  const regex = /https?:\/\/[^\s<>()"']+/gi;
  let match;
  while ((match = regex.exec(source)) && links.length < 5) {
    if (seen.has(match[0])) continue;
    seen.add(match[0]);
    links.push(match[0]);
  }
  return links;
}

function isLikelyEmail(value) {
  if (!value || value.length > 254) return false;
  if (value !== value.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = {
  EMAIL_OPTION_ID,
  INACTIVITY_TIMEOUT_MS,
  CLOSE_TIMEOUT_MS,
  VERIFY_COOLDOWN_MS,
  MAX_CREDENTIAL_INPUT,
  MAX_EMAIL_BODY_CHARS,
  DEFAULT_EMAIL_CONNECT_TITLE,
  DEFAULT_EMAIL_CONNECT_MESSAGE,
  DEFAULT_EMAIL_CONNECT_TUTORIAL,
  buildEmailPanelOption,
  parseCredentialInput,
  enforceAllowedDomain,
  sanitizeEmailText,
  extractHttpLinks,
};
