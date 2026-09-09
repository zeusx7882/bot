'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');

const { routeInteraction } = require('../src/interactions/router');

function fakePermissions(hasAdmin) {
  return { has: (flag) => hasAdmin && flag === PermissionFlagsBits.Administrator };
}

function fakeGuild(id, hasAdmin) {
  return {
    id,
    name: `Servidor ${id}`,
    members: {
      fetch: async () => ({ permissions: fakePermissions(hasAdmin) }),
    },
  };
}

function fakeButtonInteraction({ customId, guildId, hasAdmin = true }) {
  const replies = [];
  return {
    customId,
    guildId,
    guild: fakeGuild(guildId, hasAdmin),
    user: { id: 'user1' },
    inGuild: () => true,
    isChatInputCommand: () => false,
    isButton: () => true,
    isAnySelectMenu: () => false,
    isModalSubmit: () => false,
    isRepliable: () => true,
    replied: false,
    deferred: false,
    reply: async (payload) => {
      replies.push(payload);
      return payload;
    },
    showModal: async () => {
      replies.push({ modal: true });
    },
    _replies: replies,
  };
}

function fakeConfigService() {
  return {
    getOrCreate: () => ({
      config: { panel_title: 't', panel_description: 'd' },
      options: [],
    }),
  };
}

test('router: rejeita botão de configuração quando o guildId do customId não é o da interação', async () => {
  const interaction = fakeButtonInteraction({
    customId: 'tp:cfg:title:guildA',
    guildId: 'guildB',
    hasAdmin: true,
  });
  const context = { commands: new Map(), configService: fakeConfigService() };

  await routeInteraction(interaction, context);

  assert.equal(interaction._replies.length, 1);
  assert.match(interaction._replies[0].content, /outro servidor/);
});

test('router: rejeita botão de configuração para usuário sem permissão de administrador', async () => {
  const interaction = fakeButtonInteraction({
    customId: 'tp:cfg:title:guildA',
    guildId: 'guildA',
    hasAdmin: false,
  });
  const context = { commands: new Map(), configService: fakeConfigService() };

  await routeInteraction(interaction, context);

  assert.equal(interaction._replies.length, 1);
  assert.match(interaction._replies[0].content, /administrador/);
});

test('router: permite ação de botão de configuração para administrador da guild correta', async () => {
  const interaction = fakeButtonInteraction({
    customId: 'tp:cfg:title:guildA',
    guildId: 'guildA',
    hasAdmin: true,
  });
  const context = { commands: new Map(), configService: fakeConfigService() };

  await routeInteraction(interaction, context);

  assert.equal(interaction._replies.length, 1);
  assert.deepEqual(interaction._replies[0], { modal: true });
});

test('router: painel público de outra guild não abre ticket (isolamento entre servidores)', async () => {
  const replies = [];
  const interaction = {
    customId: 'tp:ticket:open:guildA',
    guildId: 'guildB',
    values: ['opt1'],
    inGuild: () => true,
    isChatInputCommand: () => false,
    isButton: () => false,
    isAnySelectMenu: () => true,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    isRepliable: () => true,
    replied: false,
    deferred: false,
    reply: async (payload) => {
      replies.push(payload);
    },
  };
  const context = {
    commands: new Map(),
    ticketService: {
      createTicket: async () => {
        throw new Error('não deveria ser chamado');
      },
    },
  };

  await routeInteraction(interaction, context);

  assert.equal(replies.length, 1);
  assert.match(replies[0].content, /não é válido neste servidor/);
});

test('router: encaminha botão de pagamento para o handler correto', async () => {
  const replies = [];
  const interaction = {
    customId: 'tp:pay:copy_link:guildA:7',
    guildId: 'guildA',
    channelId: 'chan1',
    guild: {
      ...fakeGuild('guildA', true),
      members: {
        fetch: async () => ({
          permissions: fakePermissions(true),
          roles: { cache: { has: () => false } },
        }),
      },
    },
    channel: {
      permissionsFor: () => ({ has: () => true }),
    },
    message: { id: 'msg1' },
    user: { id: 'user1' },
    inGuild: () => true,
    isChatInputCommand: () => false,
    isButton: () => true,
    isAnySelectMenu: () => false,
    isModalSubmit: () => false,
    isRepliable: () => true,
    replied: false,
    deferred: false,
    reply: async (payload) => {
      replies.push(payload);
    },
  };
  const context = {
    commands: new Map(),
    paymentLinkRepository: {
      getById: () => ({
        id: 7,
        guild_id: 'guildA',
        channel_id: 'chan1',
        message_id: 'msg1',
        creator_user_id: 'owner1',
        payment_url: 'https://pay.example/a',
      }),
    },
  };

  await routeInteraction(interaction, context);

  assert.equal(replies.length, 1);
  assert.equal(replies[0].content, 'https://pay.example/a');
});
