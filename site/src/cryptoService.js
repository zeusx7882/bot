'use strict';

const crypto = require('node:crypto');

function createCryptoService(keyBuffer) {
  if (!Buffer.isBuffer(keyBuffer) || keyBuffer.length !== 32) {
    throw new Error('DATA_KEY inválida.');
  }

  return {
    hash(value) {
      return crypto.createHash('sha256').update(toBuffer(value)).digest('hex');
    },
    hmac(value) {
      return crypto.createHmac('sha256', keyBuffer).update(toBuffer(value)).digest('hex');
    },
    encryptText(value, aad = '') {
      return encrypt(Buffer.from(String(value), 'utf8'), aad);
    },
    decryptText(record, aad = '') {
      return decrypt(record, aad).toString('utf8');
    },
    encryptJson(value, aad = '') {
      return encrypt(Buffer.from(JSON.stringify(value), 'utf8'), aad);
    },
    decryptJson(record, aad = '') {
      return JSON.parse(decrypt(record, aad).toString('utf8'));
    },
    keyVerifier() {
      return crypto.createHmac('sha256', keyBuffer).update('site-key-verifier-v1').digest('hex');
    },
  };

  function encrypt(buffer, aad) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    if (aad) cipher.setAAD(Buffer.from(String(aad), 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return {
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  function decrypt(record, aad) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, Buffer.from(String(record.iv), 'base64'));
    if (aad) decipher.setAAD(Buffer.from(String(aad), 'utf8'));
    decipher.setAuthTag(Buffer.from(String(record.authTag), 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(String(record.ciphertext), 'base64')),
      decipher.final(),
    ]);
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function toBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
}

module.exports = { createCryptoService, safeEqual };
