'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

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

  ensureColumn(db, 'guild_config', 'email_option_enabled', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'guild_config', 'email_option_label', "TEXT NOT NULL DEFAULT 'Verificar e-mail'");
  ensureColumn(
    db,
    'guild_config',
    'email_option_description',
    "TEXT NOT NULL DEFAULT 'Abra um ticket de verificação de e-mail.'"
  );
  ensureColumn(db, 'guild_config', 'email_category_id', 'TEXT');
  ensureColumn(
    db,
    'guild_config',
    'email_connect_title',
    "TEXT NOT NULL DEFAULT 'Conectado à caixa de correio com sucesso'"
  );
  ensureColumn(
    db,
    'guild_config',
    'email_connect_message',
    "TEXT NOT NULL DEFAULT 'A autenticação foi concluída. Use o botão **Verificar** para buscar o último e-mail da INBOX sob demanda.'"
  );
  ensureColumn(
    db,
    'guild_config',
    'email_connect_tutorial',
    "TEXT NOT NULL DEFAULT '1. Clique em **Verificar** para ler a mensagem mais recente (inclusive recebida antes da abertura).\\n2. Novos cliques trazem apenas novas mensagens por UID/UIDVALIDITY, sem duplicar.\\n3. Use **Mostrar conta para copiar** para visualizar e-mail/senha em resposta efêmera.\\n4. Clique em **Encerrar** para fechar este ticket com segurança.'"
  );
  ensureColumn(db, 'guild_config', 'normal_logs_channel_id', 'TEXT');

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
      ticket_type TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'creating',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  ensureColumn(db, 'tickets', 'ticket_type', "TEXT NOT NULL DEFAULT 'normal'");

  db.exec('DROP INDEX IF EXISTS idx_tickets_active_unique;');
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_active_unique_type
      ON tickets (guild_id, user_id, ticket_type)
      WHERE status IN ('creating', 'open', 'closing');
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_guild_channel
      ON tickets (guild_id, channel_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_ticket_state (
      ticket_id INTEGER PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      uid_validity TEXT,
      last_seen_uid INTEGER,
      inactivity_deadline_at INTEGER NOT NULL,
      close_deadline_at INTEGER,
      last_owner_activity_at INTEGER NOT NULL,
      last_verify_at INTEGER,
      login_attempt_count INTEGER NOT NULL DEFAULT 0,
      login_blocked_until INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );
  `);

  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_email_ticket_state_channel ON email_ticket_state (guild_id, channel_id);'
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_closure_job (
      ticket_id INTEGER PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      requested_by_user_id TEXT NOT NULL,
      requested_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      log_message_id TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_link_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      creator_user_id TEXT NOT NULL,
      payment_link_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      amount_input TEXT NOT NULL,
      amount_unit TEXT NOT NULL,
      currency TEXT NOT NULL,
      gateway_method TEXT NOT NULL,
      status TEXT NOT NULL,
      payment_url TEXT,
      operation_interaction_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_link_unique ON payment_link_state (guild_id, payment_link_id);'
  );
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}

module.exports = { openDatabase };
