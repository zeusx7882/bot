'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openSiteDatabase(config, cryptoService) {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  verifyKey(db, cryptoService);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_key_verifier (
      key_name TEXT PRIMARY KEY,
      verifier TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS oauth_state (
      state_hash TEXT PRIMARY KEY,
      redirect_path TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON oauth_state (expires_at);
    CREATE TABLE IF NOT EXISTS user_session (
      session_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      csrf_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      invalidated_at INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_user_session_user ON user_session (user_id, expires_at);
    CREATE TABLE IF NOT EXISTS discord_user_profile (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      global_name TEXT,
      avatar TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stock_service (
      service_key TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      visible INTEGER NOT NULL DEFAULT 1,
      source_hash TEXT,
      source_mtime_ms INTEGER,
      source_size INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stock_item (
      stock_id TEXT PRIMARY KEY,
      service_key TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      imported_at INTEGER NOT NULL,
      source_hash TEXT NOT NULL,
      used_at INTEGER,
      used_by_user_id TEXT,
      used_request_id TEXT,
      FOREIGN KEY (service_key) REFERENCES stock_service(service_key)
    );
    CREATE INDEX IF NOT EXISTS idx_stock_item_available ON stock_item (service_key, used_at, imported_at, stock_id);
    CREATE TABLE IF NOT EXISTS user_generation_request (
      user_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      service_key TEXT NOT NULL,
      stock_id TEXT NOT NULL,
      generated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, request_id),
      FOREIGN KEY (stock_id) REFERENCES stock_item(stock_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_generation_history ON user_generation_request (user_id, generated_at DESC);
    CREATE TABLE IF NOT EXISTS user_cooldown (
      user_id TEXT PRIMARY KEY,
      next_allowed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcript_record (
      transcript_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      ticket_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      transcript_created_at INTEGER NOT NULL,
      payload_hash TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      imported_at INTEGER NOT NULL,
      UNIQUE (guild_id, ticket_id)
    );
    CREATE INDEX IF NOT EXISTS idx_transcript_owner ON transcript_record (owner_user_id, transcript_created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transcript_retention ON transcript_record (expires_at);
  `);
}

function verifyKey(db, cryptoService) {
  const verifier = cryptoService.keyVerifier();
  const current = db.prepare('SELECT verifier FROM site_key_verifier WHERE key_name = ?').get('data_key') || null;
  if (!current) {
    db.prepare(`INSERT INTO site_key_verifier (key_name, verifier, updated_at) VALUES ('data_key', ?, datetime('now'))`).run(verifier);
    return;
  }
  if (current.verifier !== verifier) {
    throw new Error('DATA_KEY incompatível com o banco existente. Verifique backup, chave e migração antes de iniciar.');
  }
}

module.exports = { openSiteDatabase };
