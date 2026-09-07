'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PermissionFlagsBits, MessageFlags } = require('discord.js');

const { openDatabase } = require('../src/storage/database');
const { GuildConfigRepository } = require('../src/storage/guildConfigRepository');
const { PanelOptionRepository } = require('../src/storage/panelOptionRepository');
const { ConfigService } = require('../src/services/configService');
const { handleButton, handleSelect, handleModalSubmit } = require('../src/interactions/configHandlers');

const GUILD_ID = 'guildA';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-bot-confighandlers-'));
  const db = openDatabase(path.join(dir, 'test.sqlite'));
  const guildConfigRepository = new GuildConfigRepository(db);
  const panelOptionRepository = new PanelOptionRepository(db);
  const configService = new ConfigService({ guildConfigRepository, panelOptionRepository });
  configService.getOrCreate(GUILD_ID);
  const context = { configService };
  return { db, context, configService };
}

function fakeAdminGuild() {
  return {
    id: GUILD_ID,
    name: 'Servidor de teste',
    members: {
      fetch: async () => ({ permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator } }),
    },
  };
}

function fakeButtonInteraction(action, args = []) {
  const record = { showModal: null, replies: [], editReplies: [], updates: [], followUps: [] };
  return {
    customId: `tp:cfg:${action}:${GUILD_ID}${args.length ? ':' + args.join(':') : ''}`,
    guildId: GUILD_ID,
    guild: fakeAdminGuild(),
    user: { id: 'admin1' },
    inGuild: () => true,
    deferred: false,
    replied: false,
    showModal: async (modal) => {
      record.showModal = modal;
    },
    deferUpdate: async () => {},
    editReply: async (payload) => {
      record.editReplies.push(payload);
      return payload;
    },
    update: async (payload) => {
      record.updates.push(payload);
      return payload;
    },
    reply: async (payload) => {
      record.replies.push(payload);
      return payload;
    },
    followUp: async (payload) => {
      record.followUps.push(payload);
      return payload;
    },
    _record: record,
  };
}

function parseCustomId(interaction) {
  const { parse } = require('../src/ui/customId');
  return parse(interaction.customId);
}

test('handleButton "title" abre o modal de edição do título', async () => {
  const { db, context } = setup();
  const interaction = fakeButtonInteraction('title');

  await handleButton(interaction, parseCustomId(interaction), context);

  assert.ok(interaction._record.showModal);
  assert.equal(interaction._record.showModal.data.custom_id, `tp:cfg:title_submit:${GUILD_ID}`);

  db.close();
});

test('handleButton "image_remove" remove a imagem e atualiza o painel', async () => {
  const { db, context, configService } = setup();
  configService.updateImage(GUILD_ID, 'https://exemplo.com/a.png');
  const interaction = fakeButtonInteraction('image_remove');

  await handleButton(interaction, parseCustomId(interaction), context);

  assert.equal(configService.getOrCreate(GUILD_ID).config.panel_image_url, null);
  assert.equal(interaction._record.editReplies.length, 1);

  db.close();
});

test('handleButton "publish" recusa publicar sem opções/categoria/cargo/canal configurados', async () => {
  const { db, context } = setup();
  const interaction = fakeButtonInteraction('publish');

  await handleButton(interaction, parseCustomId(interaction), context);

  assert.equal(interaction._record.followUps.length, 1);
  assert.match(interaction._record.followUps[0].content, /Não é possível publicar/);
  assert.ok(interaction._record.followUps[0].flags & MessageFlags.Ephemeral);

  db.close();
});

test('handleButton "opt_remove_confirm" mostra confirmação e "opt_remove" remove a opção', async () => {
  const { db, context, configService } = setup();
  const option = configService.addOption(GUILD_ID, { label: 'Suporte' });

  const confirmInteraction = fakeButtonInteraction('opt_remove_confirm', [option.id]);
  await handleButton(confirmInteraction, parseCustomId(confirmInteraction), context);
  assert.equal(confirmInteraction._record.updates.length, 1);

  const removeInteraction = fakeButtonInteraction('opt_remove', [option.id]);
  await handleButton(removeInteraction, parseCustomId(removeInteraction), context);
  assert.equal(configService.listOptions(GUILD_ID).length, 0);
  assert.equal(removeInteraction._record.editReplies.length, 1);

  db.close();
});

test('handleButton "back" retorna à view principal do painel', async () => {
  const { db, context } = setup();
  const interaction = fakeButtonInteraction('back');

  await handleButton(interaction, parseCustomId(interaction), context);

  assert.equal(interaction._record.updates.length, 1);

  db.close();
});

test('handleSelect "category" persiste a categoria selecionada', async () => {
  const { db, context, configService } = setup();
  const interaction = fakeButtonInteraction('category');
  interaction.isAnySelectMenu = () => true;
  interaction.channels = { first: () => ({ id: 'cat1' }) };

  await handleSelect(interaction, parseCustomId(interaction), context);

  assert.equal(configService.getOrCreate(GUILD_ID).config.category_id, 'cat1');
  assert.equal(interaction._record.editReplies.length, 1);

  db.close();
});

test('handleSelect "role" recusa @everyone e informa erro amigável sem lançar', async () => {
  const { db, context, configService } = setup();
  const interaction = fakeButtonInteraction('role');
  interaction.roles = { first: () => ({ id: GUILD_ID, guild: { id: GUILD_ID } }) };

  await handleSelect(interaction, parseCustomId(interaction), context);

  assert.equal(configService.getOrCreate(GUILD_ID).config.support_role_id, null);
  assert.equal(interaction._record.followUps.length, 1);
  assert.match(interaction._record.followUps[0].content, /@everyone/);

  db.close();
});

test('handleModalSubmit "title_submit" valida e persiste o novo título', async () => {
  const { db, context, configService } = setup();
  const interaction = fakeButtonInteraction('title_submit');
  interaction.isFromMessage = () => true;
  interaction.fields = { getTextInputValue: () => 'Novo Título' };

  await handleModalSubmit(interaction, parseCustomId(interaction), context);

  assert.equal(configService.getOrCreate(GUILD_ID).config.panel_title, 'Novo Título');
  assert.equal(interaction._record.updates.length, 1);

  db.close();
});

test('handleModalSubmit "title_submit" com valor inválido responde com erro amigável', async () => {
  const { db, context, configService } = setup();
  const interaction = fakeButtonInteraction('title_submit');
  interaction.isFromMessage = () => true;
  interaction.fields = { getTextInputValue: () => '' };

  await handleModalSubmit(interaction, parseCustomId(interaction), context);

  assert.equal(interaction._record.replies.length, 1);
  assert.match(interaction._record.replies[0].content, /❌/);
  // Título não deve ter sido alterado.
  assert.equal(configService.getOrCreate(GUILD_ID).config.panel_title, 'Central de Atendimento');

  db.close();
});

test('handleModalSubmit "opt_add_submit" adiciona nova opção validada', async () => {
  const { db, context, configService } = setup();
  const interaction = fakeButtonInteraction('opt_add_submit');
  interaction.isFromMessage = () => true;
  const values = { label: 'Financeiro', description: 'Dúvidas de pagamento', emoji: '💰' };
  interaction.fields = { getTextInputValue: (key) => values[key] };

  await handleModalSubmit(interaction, parseCustomId(interaction), context);

  const options = configService.listOptions(GUILD_ID);
  assert.equal(options.length, 1);
  assert.equal(options[0].label, 'Financeiro');

  db.close();
});
