'use strict';

const { AttachmentBuilder, MessageFlags } = require('discord.js');
const { ValidationError } = require('../domain/validation');

const MAX_INLINE_COPY_CHARS = 2000;
const MAX_FILE_COPY_BYTES = 65536;

function buildPlainCopyReply(value, { fileName, overflowMessage }) {
  const raw = String(value ?? '');
  if (!raw) {
    throw new ValidationError('Não há conteúdo disponível para copiar.');
  }

  const base = {
    flags: MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds,
    allowedMentions: { parse: [] },
  };

  if (raw.length <= MAX_INLINE_COPY_CHARS) {
    return { ...base, content: raw };
  }

  const bytes = Buffer.byteLength(raw, 'utf8');
  if (bytes > MAX_FILE_COPY_BYTES) {
    throw new ValidationError('O conteúdo excede o limite seguro de cópia deste bot.');
  }

  return {
    ...base,
    content: overflowMessage,
    files: [new AttachmentBuilder(Buffer.from(raw, 'utf8'), { name: fileName })],
  };
}

module.exports = { buildPlainCopyReply, MAX_INLINE_COPY_CHARS, MAX_FILE_COPY_BYTES };
