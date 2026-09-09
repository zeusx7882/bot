'use strict';

/**
 * Logger simples. Nunca deve receber tokens/segredos — utilitário de
 * redigir strings que pareçam tokens é aplicado defensivamente.
 */
const TOKEN_LIKE_PATTERN = /[\w-]{24,}\.[\w-]{6,}\.[\w-]{20,}/g;

function redact(value) {
  if (typeof value !== 'string') return value;
  return value.replace(TOKEN_LIKE_PATTERN, '[REDACTED]');
}

function format(level, args) {
  const timestamp = new Date().toISOString();
  const message = args
    .map((arg) => (typeof arg === 'string' ? redact(arg) : arg))
    .map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : arg));
  return [`[${timestamp}] [${level}]`, ...message];
}

const logger = {
  info: (...args) => console.log(...format('INFO', args)),
  warn: (...args) => console.warn(...format('WARN', args)),
  error: (...args) => console.error(...format('ERROR', args)),
};

module.exports = { logger, redact };
