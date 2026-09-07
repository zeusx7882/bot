'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openDatabase } = require('../src/storage/database');
const { GuildConfigRepository } = require('../src/storage/guildConfigRepository');
const { PanelOptionRepository, MAX_OPTIONS_PER_GUILD } = require('../src/storage/panelOptionRepository');
const { TicketRepository, DuplicateTicketError } = require('../src/storage/ticketRepository');

function tempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-bot-test-'));
  return path.join(dir, 'test.sqlite');
}

test('GuildConfigRepository: valores padrão e isolamento entre guilds', () => {
  const dbPath = tempDbPath();
  const db = openDatabase(dbPath);
  const repo = new GuildConfigRepository(db);

  const guildA = repo.ensure('guildA');
  const guildB = repo.ensure('guildB');
  assert.equal(guildA.panel_title, 'Central de Atendimento');
  assert.equal(guildB.panel_title, 'Central de Atendimento');

  repo.setTitle('guildA', 'Título A');
  const refreshedB = repo.get('guildB');
  assert.equal(refreshedB.panel_title, 'Central de Atendimento');
  assert.equal(repo.get('guildA').panel_title, 'Título A');

  db.close();
});

test('GuildConfigRepository: atualização de um campo não sobrescreve outros (edições concorrentes)', () => {
  const dbPath = tempDbPath();
  const db = openDatabase(dbPath);
  const repo = new GuildConfigRepository(db);
  repo.ensure('guild1');

  repo.setTitle('guild1', 'Admin A editou o título');
  repo.setDescription('guild1', 'Admin B editou a descrição');

  const config = repo.get('guild1');
  assert.equal(config.panel_title, 'Admin A editou o título');
  assert.equal(config.panel_description, 'Admin B editou a descrição');

  db.close();
});

test('GuildConfigRepository: configuração persiste após reabrir o banco (reinício)', () => {
  const dbPath = tempDbPath();
  let db = openDatabase(dbPath);
  new GuildConfigRepository(db).setTitle('guildX', 'Persistido');
  db.close();

  db = openDatabase(dbPath);
  const config = new GuildConfigRepository(db).get('guildX');
  assert.equal(config.panel_title, 'Persistido');
  db.close();
});

test('PanelOptionRepository: CRUD básico e limite de 25 opções por guild', () => {
  const dbPath = tempDbPath();
  const db = openDatabase(dbPath);
  new GuildConfigRepository(db).ensure('guild1');
  const repo = new PanelOptionRepository(db);

  const option = repo.add('guild1', { label: 'Suporte', description: 'Ajuda geral', emoji: '🎫' });
  assert.ok(option.id);
  assert.equal(repo.list('guild1').length, 1);

  repo.update('guild1', option.id, { label: 'Suporte Geral' });
  assert.equal(repo.get('guild1', option.id).label, 'Suporte Geral');

  assert.equal(repo.remove('guild1', option.id), true);
  assert.equal(repo.list('guild1').length, 0);

  for (let i = 0; i < MAX_OPTIONS_PER_GUILD; i += 1) {
    repo.add('guild1', { label: `Opção ${i}` });
  }
  assert.throws(() => repo.add('guild1', { label: 'Estouro' }));

  db.close();
});

test('PanelOptionRepository: opções são isoladas por guild', () => {
  const dbPath = tempDbPath();
  const db = openDatabase(dbPath);
  const configRepo = new GuildConfigRepository(db);
  configRepo.ensure('guildA');
  configRepo.ensure('guildB');
  const repo = new PanelOptionRepository(db);

  const optionA = repo.add('guildA', { label: 'Opção da guildA' });
  assert.equal(repo.get('guildB', optionA.id), null);
  assert.equal(repo.list('guildB').length, 0);
  assert.equal(repo.list('guildA').length, 1);

  db.close();
});

test('TicketRepository: impede tickets duplicados por guild/usuário (cliques concorrentes)', () => {
  const dbPath = tempDbPath();
  const db = openDatabase(dbPath);
  const repo = new TicketRepository(db);

  const ticket = repo.createLock('guild1', 'user1', 'opt1', 'Suporte');
  assert.equal(ticket.status, 'creating');

  assert.throws(() => repo.createLock('guild1', 'user1', 'opt1', 'Suporte'), DuplicateTicketError);

  // Outro usuário ou outra guild não deve ser bloqueado.
  assert.doesNotThrow(() => repo.createLock('guild1', 'user2', 'opt1', 'Suporte'));
  assert.doesNotThrow(() => repo.createLock('guild2', 'user1', 'opt1', 'Suporte'));

  db.close();
});

test('TicketRepository: liberar o lock permite nova tentativa após falha', () => {
  const dbPath = tempDbPath();
  const db = openDatabase(dbPath);
  const repo = new TicketRepository(db);

  const ticket = repo.createLock('guild1', 'user1', 'opt1', 'Suporte');
  repo.releaseLock(ticket.id);

  assert.equal(repo.findActive('guild1', 'user1'), null);
  assert.doesNotThrow(() => repo.createLock('guild1', 'user1', 'opt1', 'Suporte'));

  db.close();
});

test('TicketRepository: markOpen registra o canal e o status', () => {
  const dbPath = tempDbPath();
  const db = openDatabase(dbPath);
  const repo = new TicketRepository(db);

  const ticket = repo.createLock('guild1', 'user1', 'opt1', 'Suporte');
  const updated = repo.markOpen(ticket.id, 'channel123');
  assert.equal(updated.status, 'open');
  assert.equal(updated.channel_id, 'channel123');

  db.close();
});
