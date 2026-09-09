'use strict';

const fs = require('node:fs');
const path = require('node:path');

let dotenv = null;
try {
  dotenv = require('dotenv');
} catch {
  dotenv = null;
}

const SITE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SITE_ROOT, '..');

loadDotEnv();

function loadDotEnv() {
  if (!dotenv) return;
  const candidates = Array.from(
    new Set([
      path.join(SITE_ROOT, '.env'),
      path.join(REPO_ROOT, '.env'),
      path.join(process.cwd(), '.env'),
    ].map((value) => path.resolve(value)))
  );
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, override: false });
  }
}

function readConfig(env = process.env) {
  const publicUrl = normalizePublicUrl(env.PUBLIC_URL || '');
  const publicOrigin = new URL(publicUrl).origin;

  return {
    siteRoot: SITE_ROOT,
    repoRoot: REPO_ROOT,
    nodeEnv: env.NODE_ENV || 'production',
    port: parsePositiveInteger(env.PORT, 3000),
    publicUrl,
    publicOrigin,
    secureCookies: !isLocalHttp(publicUrl),
    discordClientId: requireText(env.DISCORD_CLIENT_ID, 'DISCORD_CLIENT_ID'),
    discordClientSecret: requireText(env.DISCORD_CLIENT_SECRET, 'DISCORD_CLIENT_SECRET'),
    dataDir: resolveDataDir(env.DATA_DIR, SITE_ROOT),
    stockDir: path.join(SITE_ROOT, 'contas1'),
    publicDir: path.join(SITE_ROOT, 'public'),
    dataKey: parseDataKey(requireText(env.DATA_KEY, 'DATA_KEY')),
    discordOauthTimeoutMs: parsePositiveInteger(env.DISCORD_OAUTH_TIMEOUT_MS, 10000),
    sessionTtlMs: parsePositiveInteger(env.SESSION_TTL_DAYS, 7) * 24 * 60 * 60 * 1000,
    oauthStateTtlMs: parsePositiveInteger(env.OAUTH_STATE_TTL_MINUTES, 10) * 60 * 1000,
    cooldownSeconds: parsePositiveInteger(env.COOLDOWN_SECONDS, 50),
    importIntervalMs: parsePositiveInteger(env.IMPORT_INTERVAL_MS, 10000),
    catalogRefreshMs: parsePositiveInteger(env.CATALOG_REFRESH_MS, 15000),
    transcriptRetentionDays: parsePositiveInteger(env.TRANSCRIPT_RETENTION_DAYS, 30),
    trustProxy: env.TRUST_PROXY === '1',
    allowedRedirectOrigins: parseOriginAllowlist(env.ALLOWED_REDIRECT_ORIGINS_JSON, publicOrigin),
    staffByGuild: parseStringArrayMap(env.STAFF_BY_GUILD_JSON || '{}', 'STAFF_BY_GUILD_JSON'),
    transcriptKeysByGuild: parseStringMap(env.TRANSCRIPT_KEYS_JSON || '{}', 'TRANSCRIPT_KEYS_JSON'),
  };
}

function resolveDataDir(rawDataDir, baseDir) {
  const value = rawDataDir && rawDataDir.trim() ? rawDataDir.trim() : 'data';
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(baseDir, value);
}

function normalizePublicUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Variável obrigatória ausente: PUBLIC_URL.');
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('PUBLIC_URL inválida.');
  }
  if (url.hash || url.search) throw new Error('PUBLIC_URL não pode conter query ou fragmento.');
  if (!isLocalHttp(url.href) && url.protocol !== 'https:') {
    throw new Error('PUBLIC_URL precisa usar HTTPS fora de localhost.');
  }
  const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
  url.pathname = normalizedPath;
  return url.toString().replace(/\/$/, '');
}

function isLocalHttp(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function parseOriginAllowlist(raw, publicOrigin) {
  const values = raw && raw.trim() ? parseJson(raw, 'ALLOWED_REDIRECT_ORIGINS_JSON') : [publicOrigin];
  if (!Array.isArray(values)) throw new Error('ALLOWED_REDIRECT_ORIGINS_JSON inválida.');
  const origins = new Set([publicOrigin]);
  for (const value of values) {
    origins.add(new URL(String(value)).origin);
  }
  return Array.from(origins);
}

function parseStringMap(raw, label) {
  const value = parseJson(raw, label);
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} inválida.`);
  const out = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (!/^\d{5,30}$/.test(key)) throw new Error(`${label} inválida.`);
    if (typeof item !== 'string' || !item.trim()) throw new Error(`${label} inválida.`);
    out[key] = item.trim();
  }
  return out;
}

function parseStringArrayMap(raw, label) {
  const value = parseJson(raw, label);
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label} inválida.`);
  const out = Object.create(null);
  for (const [key, items] of Object.entries(value)) {
    if (!/^\d{5,30}$/.test(key) || !Array.isArray(items)) throw new Error(`${label} inválida.`);
    out[key] = items.map((item) => String(item)).filter((item) => /^\d{5,30}$/.test(item));
  }
  return out;
}

function parseJson(raw, label) {
  try {
    return JSON.parse(String(raw || ''));
  } catch {
    throw new Error(`${label} inválida.`);
  }
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`Variável obrigatória ausente: ${label}.`);
  return text;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDataKey(raw) {
  let key;
  if (/^[a-fA-F0-9]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    const asBase64 = Buffer.from(raw, 'base64');
    key = asBase64.length === 32 ? asBase64 : Buffer.from(raw, 'utf8');
  }
  if (key.length !== 32) {
    throw new Error('DATA_KEY deve ter 32 bytes (utf8, hex64 ou base64).');
  }
  return key;
}

module.exports = { SITE_ROOT, REPO_ROOT, readConfig, resolveDataDir, isLocalHttp };
