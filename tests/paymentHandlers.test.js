'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { handleButton } = require('../src/interactions/paymentHandlers');

function createInteraction() {
  const calls = [];
  return {
    guildId: 'guild1',
    channelId: 'chan1',
    user: { id: 'user1' },
    guild: {
      members: {
        fetch: async () => ({
          permissions: { has: () => true },
          roles: { cache: { has: () => true } },
        }),
      },
    },
    channel: {
      permissionsFor: () => ({ has: () => true }),
    },
    message: {
      id: 'msg1',
      edit: async () => {
        calls.push('edit-message');
      },
    },
    inGuild: () => true,
    deferReply: async () => {
      calls.push('defer');
    },
    editReply: async (payload) => {
      calls.push(['edit-reply', payload]);
    },
    reply: async (payload) => {
      calls.push(['reply', payload]);
    },
    _calls: calls,
  };
}

test('payment verify faz ack antes de aguardar a rede', async () => {
  const interaction = createInteraction();
  let observedDeferred = false;
  const context = {
    paymentLinkRepository: {
      getById: () => ({
        id: 7,
        guild_id: 'guild1',
        channel_id: 'chan1',
        message_id: 'msg1',
        creator_user_id: 'user1',
      }),
    },
    configService: {
      getOrCreate: () => ({ config: { support_role_id: 'role1' } }),
    },
    paymentLinkService: {
      refreshStatus: async () => {
        observedDeferred = interaction._calls[0] === 'defer';
        return {
          record: {
            id: 7,
            name: 'Cobrança',
            description: null,
            amount_input: '10.00',
            amount_unit: 'major',
            currency: 'BRL',
            gateway_method: 'PIX',
            status: 'APPROVED',
            payment_link_id: 'plink_1',
            payment_url: 'https://pay.example/a',
            payment_code: '000201',
          },
          paymentData: { status: 'APPROVED' },
        };
      },
    },
  };

  await handleButton(interaction, { guildId: 'guild1', action: 'verify', args: ['7'] }, context);

  assert.equal(observedDeferred, true);
  assert.equal(interaction._calls[0], 'defer');
  assert.equal(interaction._calls[1], 'edit-message');
});

test('payment copy_code responde texto simples efêmero com valor bruto', async () => {
  const interaction = createInteraction();
  const context = {
    paymentLinkRepository: {
      getById: () => ({
        id: 7,
        guild_id: 'guild1',
        channel_id: 'chan1',
        message_id: 'msg1',
        creator_user_id: 'owner1',
        payment_code: '000201010212',
      }),
    },
  };

  await handleButton(interaction, { guildId: 'guild1', action: 'copy_code', args: ['7'] }, context);

  assert.equal(interaction._calls[0][0], 'reply');
  assert.equal(interaction._calls[0][1].content, '000201010212');
  assert.equal(interaction._calls[0][1].components, undefined);
});
