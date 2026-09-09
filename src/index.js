'use strict';

const { Client, GatewayIntentBits, Events } = require('discord.js');
const { readEnv, assertRuntimeConfig } = require('./config/env');
const { openDatabase } = require('./storage/database');
const { GuildConfigRepository } = require('./storage/guildConfigRepository');
const { PanelOptionRepository } = require('./storage/panelOptionRepository');
const { TicketRepository } = require('./storage/ticketRepository');
const { EmailTicketRepository } = require('./storage/emailTicketRepository');
const { ConfigService } = require('./services/configService');
const { TicketService } = require('./services/ticketService');
const { MailcowImapService } = require('./services/mailcowImapService');
const { EmailSessionService } = require('./services/emailSessionService');
const { EmailTicketLifecycleService } = require('./services/emailTicketLifecycleService');
const ticketPainelCommand = require('./commands/ticketPainel');
const { routeInteraction } = require('./interactions/router');
const { logger } = require('./utils/logger');

function buildContext(env) {
  const db = openDatabase(env.dbPath);
  const guildConfigRepository = new GuildConfigRepository(db);
  const panelOptionRepository = new PanelOptionRepository(db);
  const ticketRepository = new TicketRepository(db);
  const emailTicketRepository = new EmailTicketRepository(db);

  const configService = new ConfigService({ guildConfigRepository, panelOptionRepository });
  const ticketService = new TicketService({
    ticketRepository,
    guildConfigRepository,
    panelOptionRepository,
    emailTicketRepository,
  });

  const mailcowImapService = new MailcowImapService({
    host: env.mailcowImapHost,
    port: env.mailcowImapPort,
    allowedDomains: env.mailcowAllowedDomains,
    authTimeoutMs: env.mailcowImapAuthTimeoutMs,
  });

  const emailSessionService = new EmailSessionService();
  const emailTicketLifecycleService = new EmailTicketLifecycleService({
    ticketRepository,
    emailTicketRepository,
    sessionService: emailSessionService,
  });

  const commands = new Map();
  commands.set(ticketPainelCommand.data.name, ticketPainelCommand);

  return {
    db,
    configService,
    ticketService,
    ticketRepository,
    emailTicketRepository,
    mailcowImapService,
    emailSessionService,
    emailTicketLifecycleService,
    commands,
  };
}

function createClient() {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });
}

async function main() {
  const env = readEnv();
  assertRuntimeConfig(env);

  const context = buildContext(env);
  const client = createClient();

  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`Bot conectado como ${readyClient.user.tag}`);
    context.emailTicketLifecycleService.attachClient(readyClient);
    context.emailTicketLifecycleService.restoreSchedules();
  });

  client.on(Events.InteractionCreate, (interaction) => {
    routeInteraction(interaction, context).catch((error) => {
      logger.error('Erro fatal não tratado ao rotear interação', error);
    });
  });

  client.on(Events.MessageCreate, (message) => {
    if (!message.inGuild() || message.author.bot) return;
    const ticket = context.ticketRepository.findByChannel(message.guildId, message.channelId);
    if (!ticket || ticket.ticket_type !== 'email' || ticket.user_id !== message.author.id || ticket.status !== 'open') {
      return;
    }
    context.emailTicketLifecycleService.touchOwnerActivity(ticket.id);
  });

  client.on(Events.ChannelDelete, (channel) => {
    if (!channel.guild) return;
    const ticket = context.ticketRepository.findByChannel(channel.guild.id, channel.id);
    if (!ticket || ticket.ticket_type !== 'email') return;
    context.emailTicketLifecycleService.clearTicket(ticket.id);
    context.ticketRepository.markClosed(ticket.id);
  });

  process.on('SIGINT', () => shutdown(client, context));
  process.on('SIGTERM', () => shutdown(client, context));

  await client.login(env.token);
}

function shutdown(client, context) {
  logger.info('Encerrando o bot...');
  try {
    context.db.close();
  } catch (error) {
    logger.error('Erro ao fechar o banco de dados', error);
  }
  client.destroy();
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('Falha ao iniciar o bot', error);
    process.exit(1);
  });
}

module.exports = { buildContext, createClient, main };
