'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { NormalTicketAlertService, ALERT_COOLDOWN_MS } = require('../src/services/normalTicketAlertService');
const { TicketServiceError } = require('../src/services/ticketService');

function createRepository(initial = null) {
  let state = initial;
  return {
    getByTicketId: () => state,
    markSent: (value) => {
      state = { ticket_id: value.ticketId, last_sent_at: value.sentAt };
      return state;
    },
    clearTicket: () => {
      state = null;
    },
  };
}

test('NormalTicketAlertService envia DM e persiste cooldown por ticket', async () => {
  const sent = [];
  const repository = createRepository();
  const service = new NormalTicketAlertService({
    normalTicketAlertRepository: repository,
    now: () => 1000,
  });
  const guild = {
    id: 'guild1',
    name: 'Servidor X',
    members: {
      fetch: async () => ({
        send: async (payload) => sent.push(payload),
      }),
    },
  };
  const channel = { id: 'chan1', isTextBased: () => true };
  const ticket = { id: 1, guild_id: 'guild1', channel_id: 'chan1', user_id: 'owner1' };

  const result = await service.notifyAuthor({ guild, channel, ticket });
  assert.equal(result.delivery, 'dm');
  assert.equal(sent.length, 1);

  await assert.rejects(() => service.notifyAuthor({ guild, channel, ticket }), TicketServiceError);
});

test('NormalTicketAlertService usa fallback no ticket quando DM falha', async () => {
  const sent = [];
  const repository = createRepository();
  const service = new NormalTicketAlertService({
    normalTicketAlertRepository: repository,
    now: () => 5000,
  });
  const guild = {
    id: 'guild1',
    name: 'Servidor X',
    members: {
      fetch: async () => ({
        send: async () => {
          throw new Error('DM fechada');
        },
      }),
    },
  };
  const channel = {
    id: 'chan1',
    isTextBased: () => true,
    send: async (payload) => sent.push(payload),
  };
  const ticket = { id: 2, guild_id: 'guild1', channel_id: 'chan1', user_id: 'owner2' };

  const result = await service.notifyAuthor({ guild, channel, ticket });
  assert.equal(result.delivery, 'channel');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].allowedMentions, { parse: [], users: ['owner2'], roles: [] });
});

test('NormalTicketAlertService não marca sucesso se DM e fallback falharem', async () => {
  let marked = false;
  const service = new NormalTicketAlertService({
    normalTicketAlertRepository: {
      getByTicketId: () => null,
      markSent: () => {
        marked = true;
      },
      clearTicket: () => {},
    },
    now: () => 9000,
  });
  const guild = {
    id: 'guild1',
    name: 'Servidor X',
    members: {
      fetch: async () => ({
        send: async () => {
          throw new Error('DM fechada');
        },
      }),
    },
  };
  const channel = {
    id: 'chan1',
    isTextBased: () => true,
    send: async () => {
      throw new Error('sem permissão');
    },
  };
  const ticket = { id: 3, guild_id: 'guild1', channel_id: 'chan1', user_id: 'owner3' };

  await assert.rejects(() => service.notifyAuthor({ guild, channel, ticket }), TicketServiceError);
  assert.equal(marked, false);
});

test('NormalTicketAlertService bloqueia envios concorrentes no mesmo ticket', async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const service = new NormalTicketAlertService({
    normalTicketAlertRepository: createRepository(),
    now: () => 12000,
  });
  const guild = {
    id: 'guild1',
    name: 'Servidor X',
    members: {
      fetch: async () => ({
        send: async () => pending,
      }),
    },
  };
  const channel = { id: 'chan1', isTextBased: () => true, send: async () => {} };
  const ticket = { id: 5, guild_id: 'guild1', channel_id: 'chan1', user_id: 'owner5' };

  const first = service.notifyAuthor({ guild, channel, ticket });
  await assert.rejects(() => service.notifyAuthor({ guild, channel, ticket }), TicketServiceError);
  release();
  await first;
});

test('NormalTicketAlertService rejeita ticket sem canal acessível', async () => {
  const service = new NormalTicketAlertService({
    normalTicketAlertRepository: createRepository({ ticket_id: 4, last_sent_at: 0 }),
    now: () => ALERT_COOLDOWN_MS + 1,
  });
  const guild = { id: 'guild1', name: 'Servidor X', members: { fetch: async () => null } };
  const ticket = { id: 4, guild_id: 'guild1', channel_id: 'chan1', user_id: 'owner4' };
  await assert.rejects(() => service.notifyAuthor({ guild, channel: null, ticket }), TicketServiceError);
});
