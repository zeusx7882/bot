'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openDatabase } = require('../src/storage/database');
const { GuildConfigRepository } = require('../src/storage/guildConfigRepository');
const { PanelOptionRepository, MAX_OPTIONS_PER_GUILD } = require('../src/storage/panelOptionRepository');
const { ConfigService } = require('../src/services/configService');
const { ValidationError } = require('../src/domain/validation');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-bot-config-'));
  const db = openDatabase(path.join(dir, 'test.sqlite'));
  const guildConfigRepository = new GuildConfigRepository(db);
  const panelOptionRepository = new PanelOptionRepository(db);
  const service = new ConfigService({ guildConfigRepository, panelOptionRepository });
  return { db, service };
}

test('ConfigService valida e persiste título/descrição/imagem/domínio', () => {
  const { db, service } = setup();
  service.getOrCreate('guild1');

  service.updateTitle('guild1', 'Novo título');
  service.updateDescription('guild1', 'Nova descrição');
  service.updateImage('guild1', 'exemplo.com/banner.png');
  service.updateDomain('guild1', 'meusite.com');

  const { config } = service.getOrCreate('guild1');
  assert.equal(config.panel_title, 'Novo título');
  assert.equal(config.panel_description, 'Nova descrição');
  assert.equal(config.panel_image_url, 'https://exemplo.com/banner.png');
  assert.equal(config.site_domain, 'https://meusite.com/');

  service.removeImage('guild1');
  service.removeDomain('guild1');
  const after = service.getOrCreate('guild1').config;
  assert.equal(after.panel_image_url, null);
  assert.equal(after.site_domain, null);

  db.close();
});

test('ConfigService.setSupportRole recusa @everyone e cargos de outro servidor', () => {
  const { db, service } = setup();
  service.getOrCreate('guild1');

  assert.throws(
    () => service.setSupportRole('guild1', { id: 'guild1', guild: { id: 'guild1' } }),
    ValidationError
  );
  assert.throws(
    () => service.setSupportRole('guild1', { id: 'role1', guild: { id: 'outraGuild' } }),
    ValidationError
  );
  assert.doesNotThrow(() => service.setSupportRole('guild1', { id: 'role1', guild: { id: 'guild1' } }));

  db.close();
});

test('ConfigService opções: validação de entradas e limite de 25', () => {
  const { db, service } = setup();
  service.getOrCreate('guild1');

  assert.throws(() => service.addOption('guild1', { label: '' }), ValidationError);
  const option = service.addOption('guild1', { label: 'Suporte', description: 'Ajuda', emoji: '🎫' });
  assert.ok(option.id);

  service.updateOption('guild1', option.id, { label: 'Suporte Geral' });
  assert.equal(service.getOption('guild1', option.id).label, 'Suporte Geral');

  for (let i = 0; i < MAX_OPTIONS_PER_GUILD - 1; i += 1) {
    service.addOption('guild1', { label: `Opção ${i}` });
  }
  assert.throws(() => service.addOption('guild1', { label: 'Estouro' }));

  db.close();
});

test('ConfigService.canPublish exige opções, categoria, cargo e canal', () => {
  const { db, service } = setup();
  const { config } = service.getOrCreate('guild1');

  assert.equal(service.canPublish(config, []), false);

  service.addOption('guild1', { label: 'Suporte' });
  service.setCategory('guild1', 'cat1');
  service.setSupportRole('guild1', { id: 'role1', guild: { id: 'guild1' } });
  service.setPublishChannel('guild1', 'chan1');

  const { config: updated, options } = service.getOrCreate('guild1');
  assert.equal(service.canPublish(updated, options), true);

  db.close();
});

test('ConfigService: nenhuma publicação sem opções válidas (canPublish falso sem opções)', () => {
  const { db, service } = setup();
  service.getOrCreate('guild1');
  service.setCategory('guild1', 'cat1');
  service.setSupportRole('guild1', { id: 'role1', guild: { id: 'guild1' } });
  service.setPublishChannel('guild1', 'chan1');

  const { config, options } = service.getOrCreate('guild1');
  assert.equal(options.length, 0);
  assert.equal(service.canPublish(config, options), false);

  db.close();
});


test('ConfigService.canPublish com opção de e-mail exige categoria exclusiva', () => {
  const { db, service } = setup();
  service.getOrCreate('guild1');
  service.setPublishChannel('guild1', 'chan1');
  service.setEmailOptionEnabled('guild1', true);

  let snapshot = service.getOrCreate('guild1');
  assert.equal(service.canPublish(snapshot.config, snapshot.options), false);

  service.setEmailCategory('guild1', 'cat-email');
  snapshot = service.getOrCreate('guild1');
  assert.equal(service.canPublish(snapshot.config, snapshot.options), true);

  db.close();
});
