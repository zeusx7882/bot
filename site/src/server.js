'use strict';

const express = require('express');
const { createCryptoService, safeEqual } = require('./cryptoService');
const { openSiteDatabase } = require('./database');
const { AuthService, sanitizeNextPath } = require('./authService');
const { RateLimitService } = require('./rateLimitService');
const { StockService } = require('./stockService');
const { TranscriptStore } = require('./transcriptStore');
const { readConfig } = require('./config');

function createApp(options = {}) {
  const config = options.config || readConfig(options.env);
  const cryptoService = options.cryptoService || createCryptoService(config.dataKey);
  const db = options.db || openSiteDatabase(config, cryptoService);
  const now = options.now || (() => Date.now());
  const authService = options.authService || new AuthService({
    db,
    cryptoService,
    config,
    fetchImpl: options.fetchImpl || global.fetch,
    now,
  });
  const rateLimit = options.rateLimit || new RateLimitService({ now });
  const stockService = options.stockService || new StockService({ db, cryptoService, config, now });
  const transcriptStore = options.transcriptStore || new TranscriptStore({ db, cryptoService, config, now });

  stockService.importFromDirectory();
  transcriptStore.cleanupExpired();

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', true);

  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/auth/login', (req, res) => {
    const rl = rateLimit.consume(`login:${getClientAddress(req, config)}`, { limit: 20, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      return res.status(429).json({ error: 'Muitas tentativas de login.' });
    }
    const state = authService.beginOAuth({ nextPath: sanitizeNextPath(req.query.next || '/') });
    setCookie(res, 'oauth_state', state, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: config.secureCookies,
      maxAge: config.oauthStateTtlMs,
      path: '/',
    });
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', config.discordClientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    url.searchParams.set('redirect_uri', `${config.publicUrl}/auth/discord/callback`);
    url.searchParams.set('prompt', 'none');
    url.searchParams.set('state', state);
    res.redirect(302, url.toString());
  });

  app.get('/auth/discord/callback', async (req, res, next) => {
    try {
      const state = String(req.query.state || '');
      const code = String(req.query.code || '');
      const cookieState = getCookie(req, 'oauth_state');
      if (!state || !code || !cookieState || !safeEqual(state, cookieState)) {
        return res.status(400).send('Falha na validação do login OAuth.');
      }
      const nextPath = authService.consumeOAuthState(state);
      const user = await authService.exchangeDiscordCode(code);
      const currentSession = getCookie(req, 'session');
      if (currentSession) authService.logout(currentSession);
      const session = authService.createSession(user);
      setCookie(res, 'oauth_state', '', {
        httpOnly: true,
        sameSite: 'Lax',
        secure: config.secureCookies,
        maxAge: 0,
        path: '/',
      });
      setCookie(res, 'session', session.rawSession, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: config.secureCookies,
        maxAge: config.sessionTtlMs,
        path: '/',
      });
      setCookie(res, 'csrf', session.csrfToken, {
        httpOnly: false,
        sameSite: 'Lax',
        secure: config.secureCookies,
        maxAge: config.sessionTtlMs,
        path: '/',
      });
      res.redirect(302, nextPath);
    } catch (error) {
      next(error);
    }
  });

  app.post('/auth/logout', requireBrowserOrigin(config), requireSession(authService), express.json({ limit: '10kb' }), requireCsrf(), (req, res) => {
    authService.logout(req.sessionToken);
    clearSessionCookies(res, config);
    res.json({ ok: true });
  });

  app.get('/api/me', requireSession(authService), (req, res) => {
    res.json({
      user: req.session.profile,
      cooldownRemainingMs: stockService.getCooldownRemainingMs(req.session.userId),
      catalogRefreshMs: config.catalogRefreshMs,
      cooldownSeconds: config.cooldownSeconds,
    });
  });

  app.get('/api/catalog', requireSession(authService), (req, res) => {
    const page = Number.parseInt(String(req.query.page || '1'), 10) || 1;
    res.json(stockService.listCatalog({ page }));
  });

  app.post('/api/generate', requireBrowserOrigin(config), requireSession(authService), express.json({ limit: '20kb' }), requireCsrf(), (req, res, next) => {
    try {
      const rl = rateLimit.consume(`api:${req.session.userId}`, { limit: 20, windowMs: 60 * 1000 });
      if (!rl.allowed) {
        return res.status(429).json({ error: 'Rate limit excedido.' });
      }
      const result = stockService.generateForUser({
        userId: req.session.userId,
        serviceKey: String(req.body?.serviceKey || ''),
        requestId: String(req.body?.requestId || ''),
      });
      res.json({
        serviceKey: String(req.body.serviceKey),
        requestId: String(req.body.requestId),
        generatedAt: result.generatedAt,
        item: result.item,
        reused: result.reused,
        cooldownRemainingMs: stockService.getCooldownRemainingMs(req.session.userId),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/history', requireSession(authService), (req, res) => {
    const page = Number.parseInt(String(req.query.page || '1'), 10) || 1;
    res.json(stockService.listHistory({ userId: req.session.userId, page }));
  });

  app.get('/api/transcripts', requireSession(authService), (req, res) => {
    const page = Number.parseInt(String(req.query.page || '1'), 10) || 1;
    res.json(transcriptStore.listForViewer({
      viewerUserId: req.session.userId,
      staffByGuild: config.staffByGuild,
      page,
    }));
  });

  app.get('/api/transcripts/:transcriptId', requireSession(authService), (req, res) => {
    const transcript = transcriptStore.getForViewer({
      transcriptId: req.params.transcriptId,
      viewerUserId: req.session.userId,
      staffByGuild: config.staffByGuild,
    });
    if (!transcript) {
      return res.status(404).json({ error: 'Transcript não encontrado.' });
    }
    res.json(transcript);
  });

  app.post('/internal/transcripts/:guildId', internalTranscriptAuth(config, rateLimit), async (req, res, next) => {
    try {
      const body = JSON.parse((await collectRawBody(req, 2 * 1024 * 1024)).toString('utf8'));
      res.json(transcriptStore.ingest({ guildId: req.params.guildId, body }));
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(config.publicDir, { index: 'index.html', setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }));

  app.use((error, _req, res, _next) => {
    if (error && error.code === 'entity.too.large') {
      return res.status(413).json({ error: 'Payload grande demais.' });
    }
    if (error && error.code === 'conflict') {
      return res.status(409).json({ error: error.message });
    }
    const message = error && error.message ? error.message : 'Erro interno.';
    const status = /inválid|OAuth|Sessão|CSRF|Origin|Serviço|Estoque|requestId|Aguarde|ticketId|title|Payload|ownerDiscordId|Anexo|Guild/i.test(message)
      ? 400
      : 500;
    res.status(status).json({ error: message });
  });

  const intervals = options.disableIntervals
    ? []
    : [
        setInterval(() => {
          try {
            stockService.importFromDirectory();
          } catch (error) {
            console.warn('Falha ao importar estoque:', error.message);
          }
        }, config.importIntervalMs),
        setInterval(() => {
          try {
            transcriptStore.cleanupExpired();
          } catch (error) {
            console.warn('Falha ao limpar transcripts:', error.message);
          }
        }, 60 * 60 * 1000),
      ];

  return { app, db, config, authService, stockService, transcriptStore, intervals };
}

function requireSession(authService) {
  return (req, res, next) => {
    const rawSession = getCookie(req, 'session');
    const session = authService.getSession(rawSession);
    if (!session) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }
    req.session = session;
    req.sessionToken = rawSession;
    next();
  };
}

function requireBrowserOrigin(config) {
  return (req, res, next) => {
    if (req.headers.origin !== config.publicOrigin) {
      return res.status(403).json({ error: 'Origin inválida.' });
    }
    next();
  };
}

function requireCsrf() {
  return (req, res, next) => {
    if (!safeEqual(req.headers['x-csrf-token'], req.session.csrfToken)) {
      return res.status(403).json({ error: 'CSRF inválido.' });
    }
    next();
  };
}

function internalTranscriptAuth(config, rateLimit) {
  return (req, res, next) => {
    const expected = config.transcriptKeysByGuild[req.params.guildId];
    if (!expected) {
      return res.status(404).json({ error: 'Guild sem chave configurada.' });
    }
    const rl = rateLimit.consume(`upload:${req.params.guildId}:${getClientAddress(req, config)}`, { limit: 30, windowMs: 60 * 1000 });
    if (!rl.allowed) {
      return res.status(429).json({ error: 'Rate limit excedido.' });
    }
    const incoming = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!incoming || !safeEqual(incoming, expected)) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
    next();
  };
}

function getClientAddress(req, config) {
  if (config.trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

function getCookie(req, name) {
  const source = String(req.headers.cookie || '');
  for (const entry of source.split(/;\s*/)) {
    const [key, ...rest] = entry.split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function setCookie(res, name, value, options) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge / 1000))}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  const current = res.getHeader('Set-Cookie');
  const values = Array.isArray(current) ? current : current ? [current] : [];
  values.push(parts.join('; '));
  res.setHeader('Set-Cookie', values);
}

function clearSessionCookies(res, config) {
  setCookie(res, 'session', '', { httpOnly: true, sameSite: 'Lax', secure: config.secureCookies, maxAge: 0, path: '/' });
  setCookie(res, 'csrf', '', { httpOnly: false, sameSite: 'Lax', secure: config.secureCookies, maxAge: 0, path: '/' });
}

async function collectRawBody(req, limitBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      const error = new Error('Payload grande demais.');
      error.code = 'entity.too.large';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = { createApp, getCookie };
