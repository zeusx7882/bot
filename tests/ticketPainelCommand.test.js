'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');

const ticketPainelCommand = require('../src/commands/ticketPainel');

function fakeInteraction({ shouldFailReply = false } = {}) {
  const replies = [];
  const followUps = [];
  return {
    guildId: 'guild-1',
    guild: {
      id: 'guild-1',
      name: 'Servidor',
      members: {
        fetch: async () => ({ permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator } }),
      },
    },
    user: { id: 'admin-1' },
    inGuild: () => true,
    deferred: false,
    replied: false,
    reply: async (payload) => {
      if (shouldFailReply) {
        throw new Error('Falha forçada');
      }
      replies.push(payload);
      return payload;
    },
    followUp: async (payload) => {
      followUps.push(payload);
      return payload;
    },
    _replies: replies,
    _followUps: followUps,
  };
}

function fakeContext() {
  return {
    configService: {
      getOrCreate: () => ({
        config: {
          panel_title: 'Título',
          panel_description: 'Descrição',
          panel_image_url: null,
          category_id: null,
          support_role_id: null,
          publish_channel_id: null,
          panel_message_id: null,
          site_domain: null,
          email_option_enabled: 0,
          email_option_label: 'Verificar e-mail',
          email_option_description: 'Descrição e-mail',
          email_category_id: null,
        },
        options: [],
      }),
    },
  };
}

test('ticket_painel abre na página Aparência com Components V2', async () => {
  const interaction = fakeInteraction();
  await ticketPainelCommand.execute(interaction, fakeContext());

  assert.equal(interaction._replies.length, 1);
  const text = JSON.stringify(interaction._replies[0].components[0].toJSON());
  assert.match(text, /tp:cfg:nav:guild-1:appearance/);
});

test('ticket_painel envia fallback efêmero quando reply principal falha', async () => {
  const interaction = fakeInteraction();
  let replyCalls = 0;
  const replies = [];
  interaction.reply = async (payload) => {
    replyCalls += 1;
    replies.push(payload);
    if (replyCalls === 1) {
      throw new Error('Falha forçada');
    }
    return payload;
  };

  await ticketPainelCommand.execute(interaction, fakeContext());
  assert.equal(replyCalls, 2);
  assert.match(replies[1].content, /Não foi possível abrir o painel/);
});
