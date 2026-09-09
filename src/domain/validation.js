'use strict';

const LIMITS = {
  panelTitle: 256,
  panelDescription: 4000,
  optionLabel: 100,
  optionDescription: 100,
  emailConnectTitle: 120,
  emailConnectMessage: 280,
  emailConnectTutorial: 1200,
  domain: 500,
  moneyInput: 32,
};

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`O campo "${fieldName}" não pode ficar vazio.`);
  }
  return value.trim();
}

function validateLength(value, max, fieldName) {
  if (value.length > max) {
    throw new ValidationError(`O campo "${fieldName}" deve ter no máximo ${max} caracteres.`);
  }
  return value;
}

function validatePanelTitle(value) {
  const trimmed = requireNonEmptyString(value, 'título');
  return validateLength(trimmed, LIMITS.panelTitle, 'título');
}

function validatePanelDescription(value) {
  const trimmed = requireNonEmptyString(value, 'descrição');
  return validateLength(trimmed, LIMITS.panelDescription, 'descrição');
}

function validateOptionLabel(value) {
  const trimmed = requireNonEmptyString(value, 'nome da opção');
  return validateLength(trimmed, LIMITS.optionLabel, 'nome da opção');
}

function validateOptionDescription(value) {
  if (value === undefined || value === null || value.trim() === '') {
    return null;
  }
  return validateLength(value.trim(), LIMITS.optionDescription, 'descrição da opção');
}

/**
 * Valida um emoji opcional informado pelo usuário. Aceita um emoji unicode
 * simples ou um emoji customizado no formato `<:nome:id>` / `<a:nome:id>`.
 * Retorna `null` quando vazio.
 */
function validateEmoji(value) {
  if (value === undefined || value === null || value.trim() === '') {
    return null;
  }
  const trimmed = value.trim();
  const customEmojiPattern = /^<a?:\w{2,32}:\d{17,20}>$/;
  if (customEmojiPattern.test(trimmed)) {
    return trimmed;
  }
  // Aceita um único "grafema" (considera sequências de code points, como
  // emojis com modificadores de tom de pele ou ZWJ) e rejeita texto comum.
  const graphemes = Array.from(trimmed);
  const isLikelyEmoji = /\p{Extended_Pictographic}/u.test(trimmed);
  if (graphemes.length <= 8 && isLikelyEmoji) {
    return trimmed;
  }
  throw new ValidationError('Emoji inválido. Use um emoji do Discord/Unicode válido ou deixe em branco.');
}

/**
 * Valida e normaliza uma URL de imagem (deve ser http(s), sem credenciais).
 */
function validateImageUrl(value) {
  return validateHttpUrl(value, 'imagem');
}

/**
 * Valida e normaliza o domínio/URL base do site. Apenas normaliza e valida a
 * sintaxe — nenhuma requisição de rede é feita para o endereço informado.
 */
function validateDomain(value) {
  return validateHttpUrl(value, 'domínio', LIMITS.domain);
}

function validateEmailConnectTitle(value) {
  const trimmed = requireNonEmptyString(value, 'título de conexão');
  return validateLength(trimmed, LIMITS.emailConnectTitle, 'título de conexão');
}

function validateEmailConnectMessage(value) {
  const trimmed = requireNonEmptyString(value, 'mensagem de conexão');
  return validateLength(trimmed, LIMITS.emailConnectMessage, 'mensagem de conexão');
}

function validateEmailConnectTutorial(value) {
  const trimmed = requireNonEmptyString(value, 'tutorial de conexão');
  return validateLength(trimmed, LIMITS.emailConnectTutorial, 'tutorial de conexão');
}

function validateHttpUrl(value, fieldName, maxLength = 2048) {
  const trimmed = requireNonEmptyString(value, fieldName);
  validateLength(trimmed, maxLength, fieldName);

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) {
    throw new ValidationError(`O ${fieldName} deve usar o protocolo http:// ou https://.`);
  }

  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new ValidationError(`O ${fieldName} informado não é uma URL válida.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError(`O ${fieldName} deve usar o protocolo http:// ou https://.`);
  }
  if (url.username || url.password) {
    throw new ValidationError(`O ${fieldName} não pode conter credenciais (usuário/senha) na URL.`);
  }
  if (!url.hostname) {
    throw new ValidationError(`O ${fieldName} informado não é uma URL válida.`);
  }

  return url.toString();
}

module.exports = {
  ValidationError,
  LIMITS,
  validatePanelTitle,
  validatePanelDescription,
  validateOptionLabel,
  validateOptionDescription,
  validateEmoji,
  validateImageUrl,
  validateDomain,
  validateEmailConnectTitle,
  validateEmailConnectMessage,
  validateEmailConnectTutorial,
  validateHttpUrl,
};
