'use strict';

const { ValidationError } = require('../domain/validation');
const { parseAmountInput, assertGatewayMethod, extractPaymentUrl, extractPaymentCode } = require('../domain/payment');
const { buildPaymentCard } = require('../ui/paymentMessage');

class PaymentLinkService {
  constructor({ paymentLinkRepository, sharpifyService, env, now = () => Date.now() }) {
    this.paymentLinkRepository = paymentLinkRepository;
    this.sharpifyService = sharpifyService;
    this.env = env;
    this.now = now;
    this.cooldowns = new Map();
  }

  assertEnabled() {
    if (!this.env.sharpifyEnabled) {
      throw new ValidationError(
        'Pagamento desabilitado: configure SHARPIFY_BASE_URL, credenciais e unidade/moeda antes de usar /link_pagamento.'
      );
    }
  }

  async createLink({ interactionId, guildId, channel, creatorUserId, name, description, amountRaw, gatewayMethod }) {
    this.assertEnabled();
    assertGatewayMethod(gatewayMethod);
    const existing = this.paymentLinkRepository.getByOperationInteractionId(interactionId);
    if (existing) return { record: existing, createdNow: false };

    const amount = parseAmountInput(amountRaw, {
      unit: this.env.sharpifyAmountUnit,
      majorDecimals: this.env.sharpifyMajorDecimals,
    });
    const created = await this.sharpifyService.createPaymentLink({
      name,
      description,
      amount: amount.amountForApi,
      gatewayMethod,
    });
    const data = created?.data || {};
    if (!data.id) {
      throw new ValidationError('Sharpify não retornou paymentLinkId.');
    }
    const paymentUrl = extractPaymentUrl(data);
    const record = this.paymentLinkRepository.create({
      guildId,
      channelId: channel.id,
      creatorUserId,
      paymentLinkId: String(data.id),
      name,
      description,
      amountInput: amount.normalized,
      amountUnit: this.env.sharpifyAmountUnit,
      currency: this.env.sharpifyCurrency,
      gatewayMethod,
      status: data.status || 'PENDING',
      paymentUrl,
      paymentCode: extractPaymentCode(data),
      operationInteractionId: interactionId,
    });
    const sent = await channel.send(buildPaymentCard({ guildId, record, paymentData: data }));
    this.paymentLinkRepository.setMessageId(record.id, sent.id);
    return { record: this.paymentLinkRepository.getById(record.id), createdNow: true };
  }

  async refreshStatus({ guildId, recordId }) {
    const key = `${guildId}:${recordId}`;
    const now = this.now();
    if ((this.cooldowns.get(key) || 0) > now) {
      throw new ValidationError('Aguarde alguns segundos antes de verificar novamente.');
    }
    this.cooldowns.set(key, now + 5000);

    const record = this.paymentLinkRepository.getById(Number(recordId));
    if (!record || record.guild_id !== guildId) {
      throw new ValidationError('Cobrança não encontrada.');
    }
    const response = await this.sharpifyService.getPaymentLink(record.payment_link_id);
    const data = response?.data || {};
    const paymentUrl = extractPaymentUrl(data);
    const updated = this.paymentLinkRepository.updateStatusAndFields(record.id, {
      status: data.status || record.status,
      paymentUrl,
      paymentCode: extractPaymentCode(data) || record.payment_code,
    });
    return { record: updated, paymentData: data };
  }
}

module.exports = { PaymentLinkService };
