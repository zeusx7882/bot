'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

/**
 * Abre (criando se necessário) o banco SQLite local e aplica as migrações
 * idempotentes do schema. Usa o módulo nativo `node:sqlite` do Node.js, então
 * não há dependências nativas externas para compilar/instalar.
 */
function openDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      panel_title TEXT NOT NULL DEFAULT 'Central de Atendimento',
      panel_description TEXT NOT NULL DEFAULT 'Selecione uma opção abaixo para abrir um ticket.',
      panel_image_url TEXT,
      category_id TEXT,
      support_role_id TEXT,
      publish_channel_id TEXT,
      panel_channel_id TEXT,
      panel_message_id TEXT,
      site_domain TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS panel_options (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      emoji TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (guild_id) REFERENCES guild_config(guild_id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_panel_options_guild
      ON panel_options (guild_id, position);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      option_id TEXT,
      option_label TEXT NOT NULL,
      channel_id TEXT,
      status TEXT NOT NULL DEFAULT 'creating',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_active_unique
      ON tickets (guild_id, user_id)
      WHERE status IN ('creating', 'open');
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_guild_channel
      ON tickets (guild_id, channel_id);
  `);
}

module.exports = { openDatabase };
