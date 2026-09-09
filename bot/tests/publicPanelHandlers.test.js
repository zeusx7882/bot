'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags, PermissionFlagsBits } = require('discord.js');

const { handleOpenSelect, handleModalSubmit, handleButton } = require('../src/interactions/publicPanelHandlers');

function fakeSelectInteraction(value) {
  const calls = { modal: null, deferred: false };
  return {
    guildId: 'guild1',
    values: [value],
    user: { id: 'user1' },
    member: { id: 'user1', user: { username: 'u', tag: 'u#1' } },
    guild: { id: 'guild1' },
    inGuild: () => true,
    showModal: async (modal) => {
      calls.modal = modal;
    },
    deferReply: async () => {
      calls.deferred = true;
    },
    _calls: calls,
  };
}

function fakeModalInteraction(action, sessionId = 'sess1') {
  const calls = { deferred: false, edited: null, replied: null };
  return {
    customId: `tp:ticket:${action}:guild1:${sessionId}`,
    guildId: 'guild1',
    channelId: 'chan1',
    user: { id: 'user1' },
    member: { id: 'user1', user: { username: 'u', tag: 'u#1' } },
    guild: { id: 'guild1' },
    inGuild: () => true,
    fields: { getTextInputValue: () => 'a@example.test:segredo:extra' },
    deferReply: async () => {
      calls.deferred = true;
    },
    editReply: async (payload) => {
      calls.edited = payload;
    },
    reply: async (payload) => {
      calls.replied = payload;
    },
    _calls: calls,
  };
}

test('handleOpenSelect abre modal para opção especial de e-mail sem criar canal imediato', async () => {
  const interaction = fakeSelectInteraction('__email_verify_option__');
  const context = {
    configService: {
      getOrCreate: () => ({ config: { email_option_enabled: 1 } }),
    },
    emailSessionService: {
      createModalSession: () => 'sess1',
    },
    ticketService: {
      createNormalTicket: async () => {
        throw new Error('não deveria abrir ticket normal');
      },
    },
  };

  await handleOpenSelect(interaction, { guildId: 'guild1' }, context);

  assert.ok(interaction._calls.modal);
  assert.equal(interaction._calls.deferred, false);
});

test('email_auth_submit autentica sem fetch inicial e não grava cursor IMAP antes de verificar', async () => {
  const interaction = fakeModalInteraction('email_auth_submit');
  const sent = [];
  const context = {
    emailSessionService: {
      consumeModalSession: () => {},
      assertCooldown: () => {},
      setCredentials: () => {},
    },
    mailcowImapService: {
      authenticate: async () => ({ ok: true }),
      fetchLatest: async () => {
        throw new Error('não deveria fazer fetch no auth inicial');
      },
    },
    configService: {
      getOrCreate: () => ({
        config: {
          email_option_label: 'Verificar e-mail',
          email_option_description: 'Desc',
          email_connect_title: 'Conectado',
          email_connect_message: 'Mensagem',
          email_connect_tutorial: 'Tutorial',
        },
      }),
    },
    ticketService: {
      createEmailTicket: async () => ({
        ticket: { id: 10, guild_id: 'guild1', channel_id: 'chanX', user_id: 'user1' },
        channel: { id: 'chanX', send: async (payload) => sent.push(payload) },
      }),
    },
    emailTicketLifecycleService: { registerEmailTicketOpen: () => {} },
    emailTicketRepository: {
      setMailProgress: () => {
        throw new Error('não deveria registrar progresso IMAP no auth inicial');
      },
    },
  };

  await handleModalSubmit(interaction, { action: 'email_auth_submit', args: ['sess1'] }, context);
  assert.equal(interaction._calls.deferred, true);
  assert.equal(sent.length, 1);
});

test('email_copy responde com credenciais separadas em modo efêmero', async () => {
  const interaction = {
    guildId: 'guild1',
    channelId: 'chan1',
    user: { id: 'user1' },
    channel: { send: async () => {} },
    inGuild: () => true,
    reply: async function (payload) {
      this._payload = payload;
    },
    _payload: null,
  };
  const context = {
    ticketRepository: {
      findByChannel: () => ({ id: 1, ticket_type: 'email', user_id: 'user1', status: 'open' }),
    },
    emailTicketRepository: {
      getByChannel: () => ({ ticket_id: 1, owner_user_id: 'user1' }),
      setMailProgress: () => {},
    },
    emailTicketLifecycleService: { touchOwnerActivity: () => {} },
    emailSessionService: {
      getCredentials: () => ({ email: 'a@example.test', password: 'segredo' }),
    },
  };

  await handleButton(interaction, { guildId: 'guild1', action: 'email_copy', args: [] }, context);
  assert.equal(interaction._payload.content, 'a@example.test:segredo');
  assert.equal(interaction._payload.components, undefined);
  assert.ok(interaction._payload.flags & MessageFlags.Ephemeral);
});

test('email_check sem credenciais após restart pede reautenticação via modal', async () => {
  const interaction = {
    guildId: 'guild1',
    channelId: 'chan1',
    user: { id: 'user1' },
    channel: { send: async () => {} },
    inGuild: () => true,
    showModal: async function (payload) {
      this._modal = payload;
    },
    _modal: null,
  };
  const context = {
    ticketRepository: {
      findByChannel: () => ({ id: 1, ticket_type: 'email', user_id: 'user1', status: 'open' }),
    },
    emailTicketRepository: {
      getByChannel: () => ({ ticket_id: 1, owner_user_id: 'user1', uid_validity: null, last_seen_uid: null }),
    },
    emailTicketLifecycleService: { touchOwnerActivity: () => {} },
    emailSessionService: {
      assertCooldown: () => {},
      getCredentials: () => null,
      createModalSession: () => 'sess-reauth',
    },
  };

  await handleButton(interaction, { guildId: 'guild1', action: 'email_check', args: [] }, context);
  assert.ok(interaction._modal);
});

test('email_result_delete apaga somente mensagem rastreada do resultado', async () => {
  const deleted = [];
  const removed = [];
  const interaction = {
    guildId: 'guild1',
    channelId: 'chan1',
    user: { id: 'user1' },
    message: {
      id: 'msg1',
      delete: async () => deleted.push('msg1'),
    },
    inGuild: () => true,
    deferReply: async () => {},
    editReply: async function (payload) {
      this._payload = payload;
    },
    _payload: null,
  };
  const context = {
    ticketRepository: {
      findByChannel: () => ({ id: 1, ticket_type: 'email', user_id: 'user1', status: 'open' }),
    },
    emailTicketRepository: {
      getByChannel: () => ({ ticket_id: 1, owner_user_id: 'user1' }),
    },
    emailTicketLifecycleService: { touchOwnerActivity: () => {} },
    emailSessionService: {},
    emailResultMessageRepository: {
      getByMessage: () => ({ ticket_id: 1, owner_user_id: 'user1' }),
      deleteByMessage: (guildId, channelId, messageId) => removed.push([guildId, channelId, messageId]),
    },
  };

  await handleButton(interaction, { guildId: 'guild1', action: 'email_result_delete', args: [] }, context);
  assert.deepEqual(deleted, ['msg1']);
  assert.deepEqual(removed, [['guild1', 'chan1', 'msg1']]);
  assert.match(interaction._payload.content, /apagada/);
});

test('email_result_delete trata mensagem já removida de forma idempotente', async () => {
  const removed = [];
  const interaction = {
    guildId: 'guild1',
    channelId: 'chan1',
    user: { id: 'user1' },
    message: {
      id: 'msg1',
      delete: async () => {
        const error = new Error('Unknown Message');
        error.code = 10008;
        throw error;
      },
    },
    inGuild: () => true,
    deferReply: async () => {},
    editReply: async function (payload) {
      this._payload = payload;
    },
    _payload: null,
  };
  const context = {
    ticketRepository: {
      findByChannel: () => ({ id: 1, ticket_type: 'email', user_id: 'user1', status: 'open' }),
    },
    emailTicketRepository: {
      getByChannel: () => ({ ticket_id: 1, owner_user_id: 'user1' }),
    },
    emailTicketLifecycleService: { touchOwnerActivity: () => {} },
    emailSessionService: {},
    emailResultMessageRepository: {
      getByMessage: () => ({ ticket_id: 1, owner_user_id: 'user1' }),
      deleteByMessage: (...args) => removed.push(args),
    },
  };

  await handleButton(interaction, { guildId: 'guild1', action: 'email_result_delete', args: [] }, context);
  assert.equal(removed.length, 1);
  assert.match(interaction._payload.content, /já havia sido apagada/);
});

test('normal_notify recusa autor sem cargo de suporte nem admin', async () => {
  const interaction = {
    guildId: 'guild1',
    channelId: 'chan1',
    user: { id: 'user1' },
    guild: {
      members: {
        fetch: async () => ({
          permissions: { has: () => false },
          roles: { cache: { has: () => false } },
        }),
      },
    },
    channel: { id: 'chan1', isTextBased: () => true },
    inGuild: () => true,
    reply: async function (payload) {
      this._payload = payload;
    },
    _payload: null,
  };
  const context = {
    ticketRepository: {
      findByChannel: () => ({ id: 1, guild_id: 'guild1', channel_id: 'chan1', ticket_type: 'normal', user_id: 'user1', status: 'open' }),
    },
    configService: {
      getOrCreate: () => ({ config: { support_role_id: 'role-support', normal_logs_channel_id: null } }),
    },
    normalTicketAlertService: {
      notifyAuthor: async () => {
        throw new Error('não deveria ser chamado');
      },
    },
  };

  await handleButton(interaction, { guildId: 'guild1', action: 'normal_notify', args: [] }, context);
  const text = JSON.stringify(interaction._payload.components[0].toJSON());
  assert.match(text, /Apenas equipe de suporte ou administrador/);
});

test('normal_notify confirma DM enviada para suporte autorizado', async () => {
  const interaction = {
    guildId: 'guild1',
    channelId: 'chan1',
    user: { id: 'staff1' },
    guild: {
      id: 'guild1',
      members: {
        fetch: async () => ({
          permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator },
          roles: { cache: { has: () => false } },
        }),
      },
    },
    channel: { id: 'chan1', isTextBased: () => true },
    inGuild: () => true,
    deferReply: async () => {},
    editReply: async function (payload) {
      this._payload = payload;
    },
    _payload: null,
  };
  const context = {
    ticketRepository: {
      findByChannel: () => ({ id: 1, guild_id: 'guild1', channel_id: 'chan1', ticket_type: 'normal', user_id: 'owner1', status: 'open' }),
    },
    configService: {
      getOrCreate: () => ({ config: { support_role_id: 'role-support', normal_logs_channel_id: null } }),
    },
    normalTicketAlertService: {
      notifyAuthor: async () => ({ delivery: 'dm' }),
    },
  };

  await handleButton(interaction, { guildId: 'guild1', action: 'normal_notify', args: [] }, context);
  assert.match(interaction._payload.content, /DM enviada/);
});
