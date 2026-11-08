import assert from 'node:assert/strict';
import { fingerprintForUser, isIsoDate, normalizeNotificationEvent, sha256 } from '../server/utils/autotrack.js';

const base = {
  amount: '250.50', direction: 'debit', transactionDate: '2026-11-08',
  sourceApp: 'com.phonepe.app', merchant: 'Amazon', reference: 'UPI123456789012',
  occurredAt: '2026-11-08T10:30:12.000Z',
};

const normalized = normalizeNotificationEvent(base);
assert.equal(normalized.amount, 250.5);
assert.equal(normalized.type, 'expense');
assert.equal(normalized.reference, 'UPI123456789012');
assert.equal(normalized.merchant, 'Amazon');
assert.equal(normalized.date, '2026-11-08');
assert.equal(isIsoDate('2026-02-30'), false);
assert.equal(isIsoDate('2026-11-08'), true);
assert.throws(() => normalizeNotificationEvent({ ...base, amount: 0 }), /amount/i);
assert.throws(() => normalizeNotificationEvent({ ...base, direction: 'unknown' }), /direction/i);
assert.throws(() => normalizeNotificationEvent({ ...base, transactionDate: '08-11-2026' }), /date/i);
assert.throws(() => normalizeNotificationEvent({ ...base, sourceApp: 'com.bad app' }), /source/i);

const fingerprint = fingerprintForUser(17, normalized);
const expectedCsvIdentity = sha256('17|2026-11-08|expense|250.50|reference:UPI123456789012');
assert.equal(fingerprint, expectedCsvIdentity, 'UTR/UPI reference fingerprint must match CSV import fingerprints');
assert.equal(fingerprintForUser(17, normalizeNotificationEvent(base)), fingerprint, 'same transaction should be idempotent');
assert.notEqual(fingerprintForUser(18, normalized), fingerprint, 'fingerprints must be user-scoped');
assert.notEqual(fingerprintForUser(17, normalizeNotificationEvent({ ...base, amount: 250.51 })), fingerprint, 'different amount should produce a different fingerprint');

console.log('AutoTrack utility tests passed.');
