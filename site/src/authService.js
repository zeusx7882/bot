'use strict';

const crypto = require('node:crypto');

class AuthService {
  constructor({ db, cryptoService, config, fetchImpl = global.fetch, now = () => Date.now() }) {
    this.db = db;
    this.cryptoService = cryptoService;
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  beginOAuth({ nextPath = '/' }) {
    const state = crypto.randomBytes(24).toString('base64url');
    const stateHash = this.cryptoService.hash(`oauth:${state}`);
    this.db.prepare('DELETE FROM oauth_state WHERE expires_at <= ? OR used_at IS NOT NULL').run(this.now());
    this.db.prepare('INSERT INTO oauth_state (state_hash, redirect_path, expires_at) VALUES (?, ?, ?)').run(
      stateHash,
      sanitizeNextPath(nextPath),
      this.now() + this.config.oauthStateTtlMs
    );
    return state;
  }

  consumeOAuthState(state) {
    const stateHash = this.cryptoService.hash(`oauth:${state}`);
    const row = this.db.prepare('SELECT * FROM oauth_state WHERE state_hash = ?').get(stateHash) || null;
    if (!row || row.used_at || row.expires_at < this.now()) {
      throw new Error('Estado OAuth inválido ou expirado.');
    }
    this.db.prepare('UPDATE oauth_state SET used_at = ? WHERE state_hash = ?').run(this.now(), stateHash);
    return row.redirect_path;
  }

  async exchangeDiscordCode(code) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.discordOauthTimeoutMs);
    try {
      const redirectUri = `${this.config.publicUrl}/auth/discord/callback`;
      const tokenResponse = await this.fetchImpl('https://discord.com/api/oauth2/token', {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.discordClientId,
          client_secret: this.config.discordClientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          scope: 'identify',
        }),
      });
      if (!tokenResponse.ok) {
        throw new Error('Falha ao trocar o código OAuth do Discord.');
      }
      const tokenData = await tokenResponse.json();
      const userResponse = await this.fetchImpl('https://discord.com/api/users/@me', {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: { authorization: `****** },
      });
      if (!userResponse.ok) {
        throw new Error('Falha ao obter o usuário do Discord.');
      }
      const user = await userResponse.json();
      if (!/^\d{5,30}$/.test(String(user.id || ''))) {
        throw new Error('Usuário Discord inválido.');
      }
      return {
        id: String(user.id),
        username: String(user.username || 'discord-user'),
        globalName: user.global_name ? String(user.global_name) : null,
        avatar: user.avatar ? String(user.avatar) : null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  createSession(user) {
    const rawSession = crypto.randomBytes(32).toString('base64url');
    const sessionHash = this.cryptoService.hash(`session:${rawSession}`);
    const csrfToken = crypto.randomBytes(24).toString('base64url');
    this.db.prepare('UPDATE user_session SET invalidated_at = ? WHERE user_id = ? AND invalidated_at IS NULL').run(this.now(), user.id);
    this.db.prepare('INSERT INTO user_session (session_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)').run(
      sessionHash,
      user.id,
      csrfToken,
      this.now() + this.config.sessionTtlMs
    );
    this.db.prepare(
      `INSERT INTO discord_user_profile (user_id, username, global_name, avatar, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, global_name = excluded.global_name, avatar = excluded.avatar, updated_at = datetime('now')`
    ).run(user.id, user.username, user.globalName, user.avatar);
    return { rawSession, csrfToken };
  }

  getSession(rawSession) {
    if (!rawSession) return null;
    const sessionHash = this.cryptoService.hash(`session:${rawSession}`);
    const row = this.db.prepare(
      `SELECT s.user_id, s.csrf_token, s.expires_at, u.username, u.global_name, u.avatar
       FROM user_session s
       JOIN discord_user_profile u ON u.user_id = s.user_id
       WHERE s.session_hash = ? AND s.invalidated_at IS NULL AND s.expires_at >= ?`
    ).get(sessionHash, this.now()) || null;
    if (!row) return null;
    return {
      userId: row.user_id,
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at,
      profile: {
        id: row.user_id,
        username: row.username,
        globalName: row.global_name,
        avatar: row.avatar,
      },
    };
  }

  logout(rawSession) {
    if (!rawSession) return;
    const sessionHash = this.cryptoService.hash(`session:${rawSession}`);
    this.db.prepare('UPDATE user_session SET invalidated_at = ? WHERE session_hash = ? AND invalidated_at IS NULL').run(this.now(), sessionHash);
  }
}

function sanitizeNextPath(nextPath) {
  const value = typeof nextPath === 'string' ? nextPath.trim() : '';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  return value;
}

module.exports = { AuthService, sanitizeNextPath };
