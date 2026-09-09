'use strict';

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { ValidationError } = require('../domain/validation');
const {
  enforceAllowedDomain,
  sanitizeEmailText,
  extractHttpLinks,
} = require('../domain/emailVerification');

const MAX_RAW_BYTES = 512000;

class MailcowImapService {
  constructor({ host, port, allowedDomains, authTimeoutMs }) {
    this.host = host;
    this.port = port;
    this.allowedDomains = allowedDomains;
    this.authTimeoutMs = authTimeoutMs;
  }

  assertConfigured() {
    if (!this.host || !this.port || !Array.isArray(this.allowedDomains) || this.allowedDomains.length === 0) {
      throw new ValidationError(
        'Verificação de e-mail indisponível: configure MAILCOW_IMAP_HOST, MAILCOW_IMAP_PORT e MAILCOW_ALLOWED_DOMAINS.'
      );
    }
  }

  async authenticate({ email, password }) {
    this.assertConfigured();
    enforceAllowedDomain(email, this.allowedDomains);
    const client = new ImapFlow({
      host: this.host,
      port: this.port,
      secure: true,
      auth: { user: email, pass: password },
      logger: false,
      tls: { rejectUnauthorized: true },
    });
    try {
      await withTimeout(client.connect(), this.authTimeoutMs, 'Tempo esgotado ao autenticar no IMAP.');
      await withTimeout(client.mailboxOpen('INBOX', { readOnly: true }), this.authTimeoutMs, 'Tempo esgotado ao abrir a INBOX.');
      return {
        uidValidity: String(client.mailbox.uidValidity || ''),
        exists: Number(client.mailbox.exists || 0),
      };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError('Falha ao autenticar no IMAP. Verifique e-mail, senha de aplicativo e tente novamente.');
    } finally {
      await client.logout().catch(() => {});
    }
  }

  async fetchLatest({ email, password, previousUidValidity = null, previousUid = null }) {
    this.assertConfigured();
    enforceAllowedDomain(email, this.allowedDomains);

    const client = new ImapFlow({
      host: this.host,
      port: this.port,
      secure: true,
      auth: { user: email, pass: password },
      logger: false,
      tls: { rejectUnauthorized: true },
    });

    try {
      await withTimeout(client.connect(), this.authTimeoutMs, 'Tempo esgotado ao autenticar no IMAP.');
      await withTimeout(client.mailboxOpen('INBOX', { readOnly: true }), this.authTimeoutMs, 'Tempo esgotado ao abrir a INBOX.');

      const uidValidity = String(client.mailbox.uidValidity || '');
      const uidNext = Number(client.mailbox.uidNext || 1);
      const exists = Number(client.mailbox.exists || 0);

      if (exists <= 0) {
        return {
          uidValidity,
          newestUid: previousUid || null,
          message: null,
          hasNew: false,
        };
      }

      const previousIsValid = previousUidValidity && previousUidValidity === uidValidity && Number.isInteger(previousUid);
      const minUidExclusive = previousIsValid ? previousUid : null;

      const result = await this._fetchNewestMessage(client, uidNext - 1, minUidExclusive);
      if (!result) {
        return {
          uidValidity,
          newestUid: previousUid || null,
          message: null,
          hasNew: false,
        };
      }

      return {
        uidValidity,
        newestUid: result.uid,
        message: result.message,
        hasNew: !minUidExclusive || result.uid > minUidExclusive,
      };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError('Falha ao autenticar no IMAP. Verifique e-mail, senha de aplicativo e tente novamente.');
    } finally {
      await client.logout().catch(() => {});
    }
  }

  async _fetchNewestMessage(client, startUid, minUidExclusive) {
    let uid = startUid;
    let checks = 0;
    while (uid > 0 && checks < 20) {
      if (Number.isInteger(minUidExclusive) && uid <= minUidExclusive) {
        return null;
      }

      const fetched = await client.fetchOne(uid, {
        uid: true,
        internalDate: true,
        envelope: true,
        source: true,
      }, { uid: true });

      if (fetched) {
        const message = await mapFetchedMessage(fetched);
        return { uid: fetched.uid, message };
      }
      uid -= 1;
      checks += 1;
    }
    return null;
  }
}

async function mapFetchedMessage(fetched) {
  const source = fetched.source;
  let parsedText = '';
  if (Buffer.isBuffer(source) && source.length > 0) {
    if (source.length > MAX_RAW_BYTES) {
      parsedText = source.toString('utf8', 0, MAX_RAW_BYTES);
    } else {
      const parsed = await simpleParser(source, { skipImageLinks: true, skipHtmlToText: false });
      parsedText = parsed.text || stripHtml(parsed.html) || '';
    }
  }

  const sanitized = sanitizeEmailText(parsedText);
  const links = extractHttpLinks(parsedText);
  const from = fetched.envelope?.from?.[0];
  const fromAddress = from?.address || 'desconhecido';
  const fromName = from?.name ? `${from.name} <${fromAddress}>` : fromAddress;

  return {
    from: fromName,
    subject: fetched.envelope?.subject || '(sem assunto)',
    internalDate: fetched.internalDate ? new Date(fetched.internalDate).toISOString() : null,
    text: sanitized.text || '_Sem corpo de texto legível._',
    truncated: sanitized.truncated,
    links,
  };
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new ValidationError(message)), timeoutMs)),
  ]);
}

module.exports = { MailcowImapService, mapFetchedMessage, stripHtml };
