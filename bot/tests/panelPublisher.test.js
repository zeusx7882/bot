'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { publishPanel } = require('../src/services/panelPublisher');

function fakeConfigServiceRecorder() {
  const calls = [];
  return {
    calls,
    setPublishedMessage: (guildId, channelId, messageId) => {
      calls.push({ guildId, channelId, messageId });
    },
  };
}

function fakeChannel({ id, existingMessages = new Map(), failSend = false } = {}) {
  let nextMessageId = existingMessages.size + 1;
  return {
    id,
    isTextBased: () => true,
    messages: {
      fetch: async (messageId) => existingMessages.get(messageId) || null,
    },
    send: async (payload) => {
      if (failSend) throw new Error('Falha simulada ao enviar');
      const message = { id: `msg${nextMessageId++}`, payload, edit: async () => message };
      existingMessages.set(message.id, message);
      return message;
    },
  };
}

test('publishPanel envia uma nova mensagem quando não há painel publicado anteriormente', async () => {
  const channel = fakeChannel({ id: 'chan1' });
  const guild = { id: 'guildA', channels: { fetch: async (id) => (id === 'chan1' ? channel : null) } };
  const configService = fakeConfigServiceRecorder();
  const config = { panel_title: 'Central', panel_description: 'Desc', publish_channel_id: 'chan1', panel_channel_id: null, panel_message_id: null };

  const result = await publishPanel({ guild, config, options: [{ id: 'o1', label: 'Suporte' }], configService });

  assert.equal(result.updatedExisting, false);
  assert.equal(configService.calls.length, 1);
  assert.equal(configService.calls[0].channelId, 'chan1');
});

test('publishPanel atualiza a mensagem existente quando o canal publicado não mudou', async () => {
  const existing = new Map();
  const channel = fakeChannel({ id: 'chan1', existingMessages: existing });
  const guild = { id: 'guildA', channels: { fetch: async (id) => (id === 'chan1' ? channel : null) } };
  const configService = fakeConfigServiceRecorder();

  existing.set('msg-old', { id: 'msg-old', edit: async (payload) => ({ id: 'msg-old', payload }) });
  const config = { panel_title: 'Central', panel_description: 'Desc', publish_channel_id: 'chan1', panel_channel_id: 'chan1', panel_message_id: 'msg-old' };

  const result = await publishPanel({ guild, config, options: [{ id: 'o1', label: 'Suporte' }], configService });

  assert.equal(result.updatedExisting, true);
  assert.equal(result.message.id, 'msg-old');
  assert.equal(configService.calls[0].messageId, 'msg-old');
});

test('publishPanel envia nova mensagem se a anterior foi apagada', async () => {
  const channel = fakeChannel({ id: 'chan1' });
  const guild = { id: 'guildA', channels: { fetch: async (id) => (id === 'chan1' ? channel : null) } };
  const configService = fakeConfigServiceRecorder();
  const config = { panel_title: 'Central', panel_description: 'Desc', publish_channel_id: 'chan1', panel_channel_id: 'chan1', panel_message_id: 'apagada' };

  const result = await publishPanel({ guild, config, options: [{ id: 'o1', label: 'Suporte' }], configService });

  assert.equal(result.updatedExisting, false);
  assert.ok(result.message.id);
});

test('publishPanel lança erro amigável quando o canal configurado não existe mais', async () => {
  const guild = { id: 'guildA', channels: { fetch: async () => null } };
  const configService = fakeConfigServiceRecorder();
  const config = { panel_title: 'Central', panel_description: 'Desc', publish_channel_id: 'chan-inexistente', panel_channel_id: null, panel_message_id: null };

  await assert.rejects(
    () => publishPanel({ guild, config, options: [{ id: 'o1', label: 'Suporte' }], configService }),
    /não existe mais/
  );
});
