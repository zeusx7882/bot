'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { handleOpenSelect } = require('../src/interactions/publicPanelHandlers');

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
