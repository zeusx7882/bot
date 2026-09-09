'use strict';

const { ValidationError } = require('./validation');

const ALLOWED_METHODS = new Set([
  'PIX',
  'EFI_PAY_PREFERENCE',
  'STRIPE_PREFERENCE',
  'CUSTOMER_BALANCE',
  'LITECOIN',
]);

function parseAmountInput(raw, { unit, majorDecimals }) {
  const value = String(raw || '').trim();
  if (!value) throw new ValidationError('Informe um valor.');

  if (unit === 'minor') {
    if (!/^\d+$/.test(value)) {
      throw new ValidationError('Com unidade minor, o valor deve ser inteiro (sem vírgula/ponto).');
    }
    return { amountForApi: Number(value), normalized: value };
  }

  if (unit === 'major') {
    if (!Number.isInteger(majorDecimals) || majorDecimals < 0 || majorDecimals > 6) {
      throw new ValidationError('SHARPIFY_MAJOR_DECIMALS inválido para unidade major.');
    }
    const pattern = new RegExp(`^\\d+(?:\\.\\d{1,${majorDecimals}})?$`);
    if (!pattern.test(value)) {
      throw new ValidationError(`Valor inválido para unidade major. Use até ${majorDecimals} casas decimais.`);
    }
    const [intPart, fracPartRaw = ''] = value.split('.');
    const fracPart = fracPartRaw.padEnd(majorDecimals, '0');
    const normalized = majorDecimals > 0 ? `${intPart}.${fracPart}` : intPart;
    const amountForApi = Number(normalized);
    if (!Number.isFinite(amountForApi) || amountForApi <= 0) {
      throw new ValidationError('Valor inválido.');
    }
    return { amountForApi, normalized };
  }

  throw new ValidationError('Configuração de unidade monetária inválida. Defina SHARPIFY_AMOUNT_UNIT=major ou minor.');
}

function assertGatewayMethod(method) {
  if (!ALLOWED_METHODS.has(method)) {
    throw new ValidationError('Método de pagamento inválido.');
  }
}

function extractPaymentUrl(data) {
  const candidate = data?.payment?.gateway?.data?.paymentLink;
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

module.exports = { ALLOWED_METHODS, parseAmountInput, assertGatewayMethod, extractPaymentUrl };
