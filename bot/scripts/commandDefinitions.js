'use strict';

const ticketPainelCommand = require('../src/commands/ticketPainel');
const linkPagamentoCommand = require('../src/commands/linkPagamento');

const commandModules = [ticketPainelCommand, linkPagamentoCommand];

function getCommandPayloads() {
  return commandModules.map((command) => command.data.toJSON());
}

module.exports = { getCommandPayloads };
