import assert from 'node:assert/strict';
import { fingerprintForUser, isIsoDate, normalizeNotificationEvent, sha256 } from '../server/utils/autotrack.js';
import {
  detectDelimiter,
  parseCSV,
  findHeaderRowIndex,
  guessColumnMapping,
  cleanAmount,
  parseDateString,
  extractMerchantAndRef,
  parseStatementRows,
} from '../server/utils/csvParser.js';

console.log('🧪 Running AutoTrack & CSV Statement Import Test Suite...\n');

// ============================================================
// 1. Notification Event Normalization & Scoped Fingerprints
// ============================================================
console.log('--- Test Suite 1: Notification & Fingerprint Security ---');
const base = {
  amount: '250.50',
  direction: 'debit',
  transactionDate: '2026-11-08',
  sourceApp: 'com.phonepe.app',
  merchant: 'Amazon',
  reference: 'UPI123456789012',
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
assert.notEqual(fingerprintForUser(17, normalizeNotificationEvent({ ...base, amount: 250.51 })), fingerprint, 'different amount should produce different fingerprint');
console.log('  ✅ PASS: Notification normalization, validation, and user-isolated fingerprints');

// ============================================================
// 2. CSV Parser Engine & Delimiter Detection
// ============================================================
console.log('--- Test Suite 2: CSV Parsing & Delimiter Detection ---');
assert.equal(detectDelimiter('Date,Description,Amount\n2026-01-01,Test,100'), ',');
assert.equal(detectDelimiter('Date;Description;Amount\n2026-01-01;Test;100'), ';');
assert.equal(detectDelimiter('Date\tDescription\tAmount\n2026-01-01\tTest\t100'), '\t');

const quotedCsv = `Date,Description,Debit,Credit
"15/04/2026","Payment to ""Swiggy"", Bangalore",540.00,
"16/04/2026","Salary deposit for April, 2026",,75000.00`;

const parsedRows = parseCSV(quotedCsv, ',');
assert.equal(parsedRows.length, 3);
assert.equal(parsedRows[1][1], 'Payment to "Swiggy", Bangalore');
assert.equal(parsedRows[1][2], '540.00');
assert.equal(parsedRows[2][3], '75000.00');
console.log('  ✅ PASS: RFC 4180 quotes, embedded commas, and delimiters handled correctly');

// ============================================================
// 3. Bank Statement Preamble & Header Heuristics
// ============================================================
console.log('--- Test Suite 3: Bank Statement Header & Column Mapping ---');
const hdfcBankStatement = [
  ['HDFC BANK LIMITED'],
  ['Account Number: XXXXXXXX1234'],
  ['Statement Period: 01/04/2026 to 30/04/2026'],
  [],
  ['Date', 'Narration', 'Chq/Ref No', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
  ['02/04/2026', 'UPI/DR/410294829102/Zomato/Order', '410294829102', '02/04/2026', '420.00', '', '15000.00'],
  ['05/04/2026', 'ACH/SALARY/INFOSYS', 'INFY20260401', '05/04/2026', '', '85000.00', '100000.00'],
];

const headerIdx = findHeaderRowIndex(hdfcBankStatement);
assert.equal(headerIdx, 4, 'Header row should skip bank preamble');

const mapping = guessColumnMapping(hdfcBankStatement[headerIdx]);
assert.equal(mapping.dateCol, 0, 'Date column mapped');
assert.equal(mapping.descCol, 1, 'Narration column mapped');
assert.equal(mapping.refCol, 2, 'Ref column mapped');
assert.equal(mapping.debitCol, 4, 'Withdrawal column mapped');
assert.equal(mapping.creditCol, 5, 'Deposit column mapped');
console.log('  ✅ PASS: Bank preamble skipped and column mapping accurately detected');

// ============================================================
// 4. Date Parsing Robustness
// ============================================================
console.log('--- Test Suite 4: Multi-Format Date Parser ---');
assert.equal(parseDateString('15/04/2026'), '2026-04-15'); // DD/MM/YYYY
assert.equal(parseDateString('15-04-2026'), '2026-04-15'); // DD-MM-YYYY
assert.equal(parseDateString('2026-04-15'), '2026-04-15'); // YYYY-MM-DD
assert.equal(parseDateString('2026/04/15'), '2026-04-15'); // YYYY/MM/DD
assert.equal(parseDateString('15 Apr 2026'), '2026-04-15'); // DD Mon YYYY
assert.equal(parseDateString('15-APR-2026'), '2026-04-15'); // DD-Mon-YYYY
assert.equal(parseDateString('04/15/2026', 'mdy'), '2026-04-15'); // MM/DD/YYYY with hint
assert.equal(parseDateString('invalid-date'), null);
assert.equal(parseDateString(''), null);
console.log('  ✅ PASS: Flexible date parsing handles all major bank date conventions');

// ============================================================
// 5. Amount Cleaning & Direction Detection
// ============================================================
console.log('--- Test Suite 5: Currency & Amount Cleaning ---');
assert.deepEqual(cleanAmount('₹1,500.50'), { value: 1500.5, isNegative: false, suffixType: null });
assert.deepEqual(cleanAmount('Rs. 25,000.00'), { value: 25000, isNegative: false, suffixType: null });
assert.deepEqual(cleanAmount('-750.00'), { value: 750, isNegative: true, suffixType: null });
assert.deepEqual(cleanAmount('1200.00 Dr'), { value: 1200, isNegative: false, suffixType: 'debit' });
assert.deepEqual(cleanAmount('50000.00 Cr'), { value: 50000, isNegative: false, suffixType: 'credit' });
assert.equal(cleanAmount('-'), null);
assert.equal(cleanAmount(''), null);
console.log('  ✅ PASS: Currency symbols, Indian commas, Dr/Cr suffixes parsed cleanly');

// ============================================================
// 6. Narration & Reference Extraction
// ============================================================
console.log('--- Test Suite 6: Merchant Cleaning & UTR Extraction ---');
const parsedNarration1 = extractMerchantAndRef('UPI/DR/410294829102/Zomato/Order', '');
assert.equal(parsedNarration1.merchant, 'Zomato');
assert.equal(parsedNarration1.reference, '410294829102');

const parsedNarration2 = extractMerchantAndRef('POS 401234XXXXXX1234 STARBUCKS COFFEE', 'TXN9988');
assert.equal(parsedNarration2.merchant, 'STARBUCKS COFFEE');
assert.equal(parsedNarration2.reference, 'TXN9988');
console.log('  ✅ PASS: UPI/UTR reference and clean merchant extracted');

// ============================================================
// 7. Statement Validation & No Silent Discarding
// ============================================================
console.log('--- Test Suite 7: Statement Row Validation & Duplicate Prevention ---');
const testRows = [
  ['Date', 'Narration', 'Debit', 'Credit'],
  ['01/05/2026', 'Swiggy', '350.00', ''], // Valid Debit
  ['02/05/2026', 'Client Payment', '', '15000.00'], // Valid Credit
  ['01/05/2026', 'Swiggy', '350.00', ''], // Duplicate within file
  ['invalid-date', 'Grocery Store', '500.00', ''], // Invalid row (bad date)
  ['03/05/2026', 'Zero amount line', '0.00', ''], // Invalid row (zero amount)
];

const existingFp = new Set();
const statementResult = parseStatementRows(testRows, {
  dateCol: 0,
  descCol: 1,
  debitCol: 2,
  creditCol: 3,
}, { userId: 42, existingFingerprints: existingFp });

assert.equal(statementResult.validRows.length, 3);
assert.equal(statementResult.validRows[0].direction, 'debit');
assert.equal(statementResult.validRows[0].amount, 350);
assert.equal(statementResult.validRows[0].isDuplicate, false);
assert.equal(statementResult.validRows[1].direction, 'credit');
assert.equal(statementResult.validRows[1].amount, 15000);
assert.equal(statementResult.validRows[1].isDuplicate, false);
assert.equal(statementResult.validRows[2].isDuplicate, true, 'Repeated row in batch flagged duplicate');

// Check invalid rows are never silently discarded
assert.equal(statementResult.invalidRows.length, 2);
assert.match(statementResult.invalidRows[0].reason, /date/i);
assert.equal(statementResult.invalidRows[0].rowNumber, 5);
assert.match(statementResult.invalidRows[1].reason, /amount/i);
assert.equal(statementResult.invalidRows[1].rowNumber, 6);
console.log('  ✅ PASS: Duplicate detection works and invalid records are explicitly explained, never silently dropped');

console.log('\n========================================');
console.log('AutoTrack & CSV Import Tests: All Passed!');
console.log('========================================\n');
