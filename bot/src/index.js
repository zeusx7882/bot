'use strict';

const { Client, GatewayIntentBits, Events } = require('discord.js');
const { readEnv, assertRuntimeConfig } = require('./config/env');
const { openDatabase } = require('./storage/database');
const { GuildConfigRepository } = require('./storage/guildConfigRepository');
const { PanelOptionRepository } = require('./storage/panelOptionRepository');
const { TicketRepository } = require('./storage/ticketRepository');
const { EmailTicketRepository } = require('./storage/emailTicketRepository');
const { TicketClosureJobRepository } = require('./storage/ticketClosureJobRepository');
const { PaymentLinkRepository } = require('./storage/paymentLinkRepository');
const { EmailResultMessageRepository } = require('./storage/emailResultMessageRepository');
const { NormalTicketAlertRepository } = require('./storage/normalTicketAlertRepository');
const { ConfigService } = require('./services/configService');
const { TicketService } = require('./services/ticketService');
const { MailcowImapService } = require('./services/mailcowImapService');
const { EmailSessionService } = require('./services/emailSessionService');
const { EmailTicketLifecycleService } = require('./services/emailTicketLifecycleService');
const { TranscriptService } = require('./services/transcriptService');
const { NormalTicketClosureService } = require('./services/normalTicketClosureService');
const { NormalTicketAlertService } = require('./services/normalTicketAlertService');
const { SharpifyService } = require('./services/sharpifyService');
const { PaymentLinkService } = require('./services/paymentLinkService');
const ticketPainelCommand = require('./commands/ticketPainel');
const linkPagamentoCommand = require('./commands/linkPagamento');
const { routeInteraction } = require('./interactions/router');
const { logger } = require('./utils/logger');

function buildContext(env) {
  const db = openDatabase(env.dbPath);
  const guildConfigRepository = new GuildConfigRepository(db);
  const panelOptionRepository = new PanelOptionRepository(db);
  const ticketRepository = new TicketRepository(db);
  const emailTicketRepository = new EmailTicketRepository(db);
  const ticketClosureJobRepository = new TicketClosureJobRepository(db);
  const paymentLinkRepository = new PaymentLinkRepository(db);
  const emailResultMessageRepository = new EmailResultMessageRepository(db);
  const normalTicketAlertRepository = new NormalTicketAlertRepository(db);

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
    emailResultMessageRepository,
    sessionService: emailSessionService,
  });
  const transcriptService = new TranscriptService();
  const normalTicketClosureService = new NormalTicketClosureService({
    ticketRepository,
    guildConfigRepository,
    ticketClosureJobRepository,
    transcriptService,
  });
  const normalTicketAlertService = new NormalTicketAlertService({
    normalTicketAlertRepository,
  });

  const sharpifyService = new SharpifyService({
    baseUrl: env.sharpifyBaseUrl,
    clientId: env.sharpifyClientId,
    clientSecret: env.sharpifyClientSecret,
    timeoutMs: env.sharpifyTimeoutMs,
  });
  const paymentLinkService = new PaymentLinkService({
    paymentLinkRepository,
    sharpifyService,
    env,
  });

  const commands = new Map();
  commands.set(ticketPainelCommand.data.name, ticketPainelCommand);
  commands.set(linkPagamentoCommand.data.name, linkPagamentoCommand);

  return {
    db,
    configService,
    ticketService,
    ticketRepository,
    emailTicketRepository,
    emailResultMessageRepository,
    mailcowImapService,
    emailSessionService,
    emailTicketLifecycleService,
    normalTicketClosureService,
    normalTicketAlertRepository,
    normalTicketAlertService,
    paymentLinkService,
    paymentLinkRepository,
    commands,
  };
}

function createClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      ...(process.env.MESSAGE_CONTENT_INTENT === '1' ? [GatewayIntentBits.MessageContent] : []),
    ],
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
    context.normalTicketClosureService.attachClient(readyClient, {
      messageContentEnabled: process.env.MESSAGE_CONTENT_INTENT === '1',
    });
    context.normalTicketClosureService.restorePending().catch(() => {});
  });

  client.on(Events.InteractionCreate, (interaction) => {
    routeInteraction(interaction, context).catch((error) => {
      logger.error('Erro fatal não tratado ao rotear interação', error);
    });
  });

  client.on(Events.MessageCreate, (message) => {
    if (!message.inGuild() || message.author.bot) return;
    const ticket = context.ticketRepository.findByChannel(message.guildId, message.channelId);
    if (!ticket) return;
    if (ticket.ticket_type === 'email' && ticket.user_id === message.author.id && ticket.status === 'open') {
      context.emailTicketLifecycleService.touchOwnerActivity(ticket.id);
      return;
    }
    if (ticket.ticket_type === 'normal' && ticket.status === 'closing') {
      message.delete().catch(() => {});
    }
  });

  client.on(Events.ChannelDelete, (channel) => {
    if (!channel.guild) return;
    const ticket = context.ticketRepository.findByChannel(channel.guild.id, channel.id);
    if (!ticket) return;
    if (ticket.ticket_type === 'email') {
      context.emailTicketLifecycleService.clearTicket(ticket.id);
    } else {
      context.normalTicketAlertService.clearTicket(ticket.id);
    }
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
