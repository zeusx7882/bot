'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openDatabase } = require('../src/storage/database');
const { EmailTicketRepository } = require('../src/storage/emailTicketRepository');

function tempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-bot-emailstate-'));
  return path.join(dir, 'test.sqlite');
}

test('EmailTicketRepository persiste deadlines e progresso IMAP', () => {
  const db = openDatabase(tempDbPath());
  const repo = new EmailTicketRepository(db);

  db.prepare(`INSERT INTO tickets (id, guild_id, user_id, option_label, ticket_type, status, channel_id) VALUES (1, 'guild1', 'user1', 'Verificar e-mail', 'email', 'open', 'chan1')`).run();

  repo.createState({
    ticketId: 1,
    guildId: 'guild1',
    channelId: 'chan1',
    ownerUserId: 'user1',
    inactivityDeadlineAt: 1000,
    now: 1,
  });

  repo.touchActivity(1, 100, 2000);
  repo.setMailProgress(1, '123', 55, 150);
  repo.setCloseDeadline(1, 3000);

  const row = repo.getByChannel('guild1', 'chan1');
  assert.equal(row.uid_validity, '123');
  assert.equal(row.last_seen_uid, 55);
  assert.equal(row.inactivity_deadline_at, 2000);
  assert.equal(row.close_deadline_at, 3000);

  db.close();
});
