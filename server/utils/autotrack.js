import crypto from 'node:crypto';

const MAX_AMOUNT = 999999999999.99;

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function cleanText(value, maxLength, fallback = '') {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength) || fallback;
}

export function normalizeNotificationEvent(input) {
  const amount = Number(input?.amount);
  const direction = String(input?.direction || '').toLowerCase();
  const date = String(input?.transactionDate || '');
  const sourceApp = cleanText(input?.sourceApp, 120);
  const merchant = cleanText(input?.merchant, 180, 'UPI transaction');
  const reference = cleanText(input?.reference, 150).replace(/\s/g, '').toUpperCase();
  const occurredAt = String(input?.occurredAt || '');

  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new Error('Invalid transaction amount.');
  }
  if (!['debit', 'credit'].includes(direction)) {
    throw new Error('Transaction direction must be debit or credit.');
  }
  if (!isIsoDate(date)) throw new Error('Invalid transaction date.');
  if (!sourceApp || !/^[a-zA-Z0-9_.]+$/.test(sourceApp)) throw new Error('Invalid source application identifier.');
  if (occurredAt && !Number.isFinite(Date.parse(occurredAt))) throw new Error('Invalid notification timestamp.');

  const safeAmount = Number(amount.toFixed(2));
  const type = direction === 'debit' ? 'expense' : 'income';
  // This format intentionally matches the CSV importer when a bank UTR/RRN is available.
  return {
    amount: safeAmount,
    direction,
    type,
    date,
    sourceApp,
    merchant,
    reference: reference || null,
    occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
  };
}

export function fingerprintForUser(userId, event) {
  const identity = event.reference
    ? `reference:${event.reference.toUpperCase()}`
    : `description:${event.merchant.toLowerCase()}|source:${event.sourceApp}|minute:${event.occurredAt ? event.occurredAt.slice(0, 16) : `${event.date}T00:00`}`;
  const value = `${userId}|${event.date}|${event.type}|${event.amount.toFixed(2)}|${identity}`;
  return sha256(value);
}
