'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

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
      setMailProgress: () => {},
    },
    emailTicketLifecycleService: { touchOwnerActivity: () => {} },
    emailSessionService: {
      getCredentials: () => ({ email: 'a@example.test', password: 'segredo' }),
    },
  };

  await handleButton(interaction, { guildId: 'guild1', action: 'email_copy', args: [] }, context);
  const text = JSON.stringify(interaction._payload.components[0].toJSON());
  assert.match(text, /E-mail: a@example\.test/);
  assert.match(text, /Senha: segredo/);
});
