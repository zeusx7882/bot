'use strict';

const { PermissionFlagsBits } = require('discord.js');

class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Revalida, em toda interação (comando, botão, select ou modal), que:
 *  - a interação ocorre dentro de uma guild (nunca em DM);
 *  - a guild da interação é a mesma guild embutida no customId (evita que
 *    uma sessão de configuração vaze/seja reaproveitada em outro servidor);
 *  - o autor da interação é administrador *no momento atual* (busca membro
 *    fresco, não confia em estado em cache/memória).
 *
 * Lança `AuthorizationError` com mensagem amigável em pt-BR quando a
 * validação falha.
 */
async function assertGuildAdmin(interaction, expectedGuildId = null) {
  if (!interaction.inGuild() || !interaction.guild) {
    throw new AuthorizationError('Este comando só pode ser usado dentro de um servidor.');
  }

  if (expectedGuildId && interaction.guildId !== expectedGuildId) {
    throw new AuthorizationError('Esta configuração pertence a outro servidor.');
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    throw new AuthorizationError('Não foi possível confirmar sua identidade neste servidor.');
  }

  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    throw new AuthorizationError('Apenas administradores podem realizar esta ação.');
  }

  return member;
}

module.exports = { assertGuildAdmin, AuthorizationError };
