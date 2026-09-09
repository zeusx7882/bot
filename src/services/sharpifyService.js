'use strict';

const { ValidationError } = require('../domain/validation');

class SharpifyService {
  constructor({ baseUrl, clientId, clientSecret, timeoutMs = 10000 }) {
    this.baseUrl = baseUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.timeoutMs = timeoutMs;
  }

  assertConfigured() {
    if (!this.baseUrl || !this.clientId || !this.clientSecret) {
      throw new ValidationError(
        'Pagamento indisponível: configure SHARPIFY_BASE_URL, SHARPIFY_CLIENT_ID e SHARPIFY_CLIENT_SECRET.'
      );
    }
  }

  async createPaymentLink({ name, description, amount, gatewayMethod }) {
    this.assertConfigured();
    return this.#request('/api/v1/checkout/payment-link/create', {
      method: 'POST',
      body: { name, description, amount, gatewayMethod },
    });
  }

  async getPaymentLink(paymentLinkId) {
    this.assertConfigured();
    const query = new URLSearchParams({ paymentLinkId });
    return this.#request(`/api/v1/checkout/payment-link/get?${query.toString()}`, {
      method: 'GET',
      retries: 2,
    });
  }

  async #request(path, { method, body, retries = 0 }) {
    const url = new URL(path, this.baseUrl);
    const attempt = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'x-sharpify-client-id': this.clientId,
            'x-sharpify-client-secret': this.clientSecret,
          },
          body: body ? JSON.stringify(body) : undefined,
          redirect: 'error',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new ValidationError(`Sharpify retornou ${response.status}.`);
        }
        const json = await response.json().catch(() => {
          throw new ValidationError('Resposta inválida da Sharpify (JSON malformado).');
        });
        return json;
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new ValidationError('Tempo esgotado ao consultar a Sharpify.');
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    };

    let last = null;
    for (let i = 0; i <= retries; i += 1) {
      try {
        return await attempt();
      } catch (error) {
        last = error;
        if (i === retries) break;
      }
    }
    throw last || new ValidationError('Falha ao consultar Sharpify.');
  }
}

module.exports = { SharpifyService };
