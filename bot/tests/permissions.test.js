'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { assertGuildAdmin, AuthorizationError } = require('../src/utils/permissions');

function fakePermissions(hasAdmin) {
  return { has: (flag) => hasAdmin && flag === PermissionFlagsBits.Administrator };
}

function fakeInteraction({ inGuild = true, guild = {}, userId = 'user1', member = undefined } = {}) {
  return {
    inGuild: () => inGuild,
    guild,
    guildId: guild && guild.id,
    user: { id: userId },
  };
}

test('assertGuildAdmin rejeita interações fora de uma guild', async () => {
  const interaction = fakeInteraction({ inGuild: false, guild: null });
  await assert.rejects(() => assertGuildAdmin(interaction), AuthorizationError);
});

test('assertGuildAdmin rejeita quando o guildId do customId não bate com o da interação', async () => {
  const guild = { id: 'guildA', members: { fetch: async () => ({ permissions: fakePermissions(true) }) } };
  const interaction = fakeInteraction({ guild });
  await assert.rejects(() => assertGuildAdmin(interaction, 'guildB'), AuthorizationError);
});

test('assertGuildAdmin busca o membro de forma fresca e rejeita não-administradores', async () => {
  const guild = {
    id: 'guildA',
    members: { fetch: async () => ({ permissions: fakePermissions(false) }) },
  };
  const interaction = fakeInteraction({ guild });
  await assert.rejects(() => assertGuildAdmin(interaction, 'guildA'), AuthorizationError);
});

test('assertGuildAdmin aprova administradores confirmados na guild correta', async () => {
  let fetchCalls = 0;
  const guild = {
    id: 'guildA',
    members: {
      fetch: async () => {
        fetchCalls += 1;
        return { permissions: fakePermissions(true) };
      },
    },
  };
  const interaction = fakeInteraction({ guild });
  const member = await assertGuildAdmin(interaction, 'guildA');
  assert.ok(member);
  assert.equal(fetchCalls, 1);
});

test('assertGuildAdmin rejeita quando membro não é encontrado (ex.: saiu do servidor)', async () => {
  const guild = { id: 'guildA', members: { fetch: async () => null } };
  const interaction = fakeInteraction({ guild });
  await assert.rejects(() => assertGuildAdmin(interaction, 'guildA'), AuthorizationError);
});
