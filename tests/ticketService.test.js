'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const { openDatabase } = require('../src/storage/database');
const { GuildConfigRepository } = require('../src/storage/guildConfigRepository');
const { PanelOptionRepository } = require('../src/storage/panelOptionRepository');
const { TicketRepository } = require('../src/storage/ticketRepository');
const { TicketService, TicketServiceError, AlreadyHasTicketError } = require('../src/services/ticketService');

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-bot-ticketsvc-'));
  const db = openDatabase(path.join(dir, 'test.sqlite'));
  const guildConfigRepository = new GuildConfigRepository(db);
  const panelOptionRepository = new PanelOptionRepository(db);
  const ticketRepository = new TicketRepository(db);
  const service = new TicketService({ ticketRepository, guildConfigRepository, panelOptionRepository });
  return { db, service, guildConfigRepository, panelOptionRepository, ticketRepository };
}

/** Cria um guild "fake" mínimo o suficiente para o TicketService. */
function fakeGuild({ categoryId = 'cat1', roleId = 'role1', channelsThatFail = new Set() } = {}) {
  const createdChannels = [];
  let nextChannelId = 1;

  const guild = {
    id: 'guildA',
    members: {
      me: { id: 'bot1' },
    },
    channels: {
      fetch: async (id) => {
        if (id === categoryId) return { id: categoryId, type: ChannelType.GuildCategory };
        const existing = createdChannels.find((c) => c.id === id);
        return existing || null;
      },
      create: async (options) => {
        if (channelsThatFail.has('create')) {
          throw new Error('Falha simulada ao criar canal');
        }
        const channel = {
          id: `chan${nextChannelId++}`,
          name: options.name,
          permissionOverwrites: options.permissionOverwrites,
          deleted: false,
          send: async (payload) => {
            if (channelsThatFail.has('send')) {
              throw new Error('Falha simulada ao enviar mensagem');
            }
            return { id: 'msg1', payload };
          },
          delete: async () => {
            channel.deleted = true;
          },
        };
        createdChannels.push(channel);
        return channel;
      },
    },
    roles: {
      fetch: async (id) => (id === roleId ? { id: roleId } : null),
    },
  };

  return { guild, createdChannels };
}

test('TicketService cria o canal com overwrites explícitos mínimos e envia a mensagem inicial', async () => {
  const { db, service, guildConfigRepository, panelOptionRepository } = setup();
  guildConfigRepository.ensure('guildA');
  guildConfigRepository.setCategory('guildA', 'cat1');
  guildConfigRepository.setSupportRole('guildA', 'role1');
  const option = panelOptionRepository.add('guildA', { label: 'Suporte' });

  const { guild, createdChannels } = fakeGuild();
  const member = { id: 'user1', user: { username: 'fulano', tag: 'fulano#0001' } };

  const channel = await service.createTicket({ guild, member, optionId: option.id });

  assert.equal(createdChannels.length, 1);
  assert.equal(channel.id, createdChannels[0].id);

  const overwrites = channel.permissionOverwrites;
  const everyoneOverwrite = overwrites.find((o) => o.id === 'guildA');
  const memberOverwrite = overwrites.find((o) => o.id === 'user1');
  const roleOverwrite = overwrites.find((o) => o.id === 'role1');
  const botOverwrite = overwrites.find((o) => o.id === 'bot1');

  assert.deepEqual(everyoneOverwrite.deny, [PermissionFlagsBits.ViewChannel]);
  assert.ok(memberOverwrite.allow.includes(PermissionFlagsBits.ViewChannel));
  assert.ok(roleOverwrite.allow.includes(PermissionFlagsBits.ViewChannel));
  assert.ok(botOverwrite.allow.includes(PermissionFlagsBits.ViewChannel));
  // Categoria não deve ser consultada para overwrites: nenhum overwrite extra da categoria é copiado.
  assert.equal(overwrites.length, 4);

  db.close();
});

test('TicketService impede duplo ticket para o mesmo usuário (mesmo em cliques concorrentes)', async () => {
  const { db, service, guildConfigRepository, panelOptionRepository } = setup();
  guildConfigRepository.ensure('guildA');
  guildConfigRepository.setCategory('guildA', 'cat1');
  guildConfigRepository.setSupportRole('guildA', 'role1');
  const option = panelOptionRepository.add('guildA', { label: 'Suporte' });

  const { guild } = fakeGuild();
  const member = { id: 'user1', user: { username: 'fulano', tag: 'fulano#0001' } };

  await service.createTicket({ guild, member, optionId: option.id });
  await assert.rejects(() => service.createTicket({ guild, member, optionId: option.id }), AlreadyHasTicketError);

  db.close();
});

test('TicketService recupera de canal apagado manualmente permitindo novo ticket', async () => {
  const { db, service, guildConfigRepository, panelOptionRepository, ticketRepository } = setup();
  guildConfigRepository.ensure('guildA');
  guildConfigRepository.setCategory('guildA', 'cat1');
  guildConfigRepository.setSupportRole('guildA', 'role1');
  const option = panelOptionRepository.add('guildA', { label: 'Suporte' });

  const { guild, createdChannels } = fakeGuild();
  const member = { id: 'user1', user: { username: 'fulano', tag: 'fulano#0001' } };

  const firstChannel = await service.createTicket({ guild, member, optionId: option.id });
  // Simula exclusão manual do canal pelo Discord.
  createdChannels.splice(createdChannels.findIndex((c) => c.id === firstChannel.id), 1);

  const secondChannel = await service.createTicket({ guild, member, optionId: option.id });
  assert.notEqual(secondChannel.id, firstChannel.id);
  assert.equal(ticketRepository.findActive('guildA', 'user1').channel_id, secondChannel.id);

  db.close();
});

test('TicketService libera o lock e remove o canal órfão se o envio da mensagem falhar', async () => {
  const { db, service, guildConfigRepository, panelOptionRepository, ticketRepository } = setup();
  guildConfigRepository.ensure('guildA');
  guildConfigRepository.setCategory('guildA', 'cat1');
  guildConfigRepository.setSupportRole('guildA', 'role1');
  const option = panelOptionRepository.add('guildA', { label: 'Suporte' });

  const { guild, createdChannels } = fakeGuild({ channelsThatFail: new Set(['send']) });
  const member = { id: 'user1', user: { username: 'fulano', tag: 'fulano#0001' } };

  await assert.rejects(() => service.createTicket({ guild, member, optionId: option.id }));

  assert.equal(ticketRepository.findActive('guildA', 'user1'), null);
  assert.equal(createdChannels[0].deleted, true);

  // Deve ser possível tentar novamente sem ficar travado.
  const { guild: guild2 } = fakeGuild();
  const channel = await service.createTicket({ guild: guild2, member, optionId: option.id });
  assert.ok(channel.id);

  db.close();
});

test('TicketService recusa quando categoria ou cargo configurados não existem mais', async () => {
  const { db, service, guildConfigRepository, panelOptionRepository } = setup();
  guildConfigRepository.ensure('guildA');
  guildConfigRepository.setCategory('guildA', 'cat-inexistente');
  guildConfigRepository.setSupportRole('guildA', 'role1');
  const option = panelOptionRepository.add('guildA', { label: 'Suporte' });

  const { guild } = fakeGuild();
  const member = { id: 'user1', user: { username: 'fulano', tag: 'fulano#0001' } };

  await assert.rejects(() => service.createTicket({ guild, member, optionId: option.id }), TicketServiceError);

  db.close();
});
