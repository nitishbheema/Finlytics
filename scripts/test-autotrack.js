import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fingerprintForUser, isIsoDate, normalizeNotificationEvent, sha256 } from '../server/utils/autotrack.js';
import {
  detectDelimiter,
  parseCSV,
  findHeaderRowIndex,
  guessColumnMapping,
  detectStatementFormat,
  cleanUpiEntity,
  isSuccessfulStatus,
  autoCategorize,
  cleanAmount,
  parseDateString,
  parseAndNormalizeStatement,
  parseStatementRows,
} from '../server/utils/csvParser.js';

console.log('🧪 Running Comprehensive AutoTrack Automated Import Test Suite...\n');

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
// 3. Automated Format Detection (UPI Unified, GPay, PhonePe, Paytm, Banks)
// ============================================================
console.log('--- Test Suite 3: Automated Statement Format Detection ---');

// BHIM / UPI Unified Statement headers (from sample)
const upiUnifiedHeaders = [
  'Date', 'Time', 'Bank Name', 'Account Number', 'Sender', 'Receiver',
  'Payment ID/Reference Number', 'Pay/Collect', 'Amount (in Rs.)', 'DR/CR', 'Status'
];
const upiFormat = detectStatementFormat(upiUnifiedHeaders);
assert.equal(upiFormat.formatId, 'upi_unified');
assert.equal(upiFormat.isRecognized, true);
assert.equal(upiFormat.mapping.dateCol, 0);
assert.equal(upiFormat.mapping.amountCol, 8);
assert.equal(upiFormat.mapping.typeCol, 9);
assert.equal(upiFormat.mapping.statusCol, 10);

// Google Pay headers
const gpayHeaders = ['Date', 'Time', 'Google Transaction ID', 'Description', 'Amount', 'Status'];
const gpayFormat = detectStatementFormat(gpayHeaders);
assert.equal(gpayFormat.formatId, 'google_pay');
assert.equal(gpayFormat.isRecognized, true);

// PhonePe headers
const phonepeHeaders = ['Date', 'Transaction ID', 'Transaction With', 'Type', 'Amount', 'Status'];
const phonepeFormat = detectStatementFormat(phonepeHeaders);
assert.equal(phonepeFormat.formatId, 'phonepe');
assert.equal(phonepeFormat.isRecognized, true);

// Standard Bank headers
const bankHeaders = ['Date', 'Narration', 'Chq/Ref No', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'];
const bankFormat = detectStatementFormat(bankHeaders);
assert.equal(bankFormat.formatId, 'bank_statement');
assert.equal(bankFormat.isRecognized, true);
console.log('  ✅ PASS: Auto-format detection accurately recognizes UPI Unified, GPay, PhonePe, and Bank CSVs');

// ============================================================
// 4. Entity Cleaning & Status Filtering (Success vs. Failure)
// ============================================================
console.log('--- Test Suite 4: Entity Cleaning & Status Filtering ---');
assert.equal(cleanUpiEntity('xxxxx09933@ybl(NARAYANA BHIMA)'), 'NARAYANA BHIMA');
assert.equal(cleanUpiEntity('xxxxxxxxxndra6@okaxis(xxxxxxxxNDRA)'), 'xxxxxxxxNDRA');
assert.equal(cleanUpiEntity('swiggy@icici(Swiggy Orders)'), 'Swiggy Orders');
assert.equal(cleanUpiEntity('zomato@hdfcbank'), 'Zomato');

assert.equal(isSuccessfulStatus('SUCCESS'), true);
assert.equal(isSuccessfulStatus('COMPLETED'), true);
assert.equal(isSuccessfulStatus('PAID'), true);
assert.equal(isSuccessfulStatus('FAILURE'), false);
assert.equal(isSuccessfulStatus('FAILED'), false);
assert.equal(isSuccessfulStatus('DECLINED'), false);
assert.equal(isSuccessfulStatus('PENDING'), false);
console.log('  ✅ PASS: Clean counterparty extraction and rigorous success/failure filtering');

// ============================================================
// 5. Intelligent Category Auto-Assignment
// ============================================================
console.log('--- Test Suite 5: Intelligent Category Auto-Classification ---');
const mockCategories = [
  { category_id: 1, category_name: 'Food', category_type: 'expense' },
  { category_id: 2, category_name: 'Travel', category_type: 'expense' },
  { category_id: 3, category_name: 'Shopping', category_type: 'expense' },
  { category_id: 4, category_name: 'Bills', category_type: 'expense' },
  { category_id: 5, category_name: 'Entertainment', category_type: 'expense' },
  { category_id: 9, category_name: 'Other Expense', category_type: 'expense' },
  { category_id: 10, category_name: 'Salary', category_type: 'income' },
  { category_id: 11, category_name: 'Investment', category_type: 'income' },
  { category_id: 12, category_name: 'Bonus', category_type: 'income' },
  { category_id: 17, category_name: 'Other Income', category_type: 'income' },
];

const catSwiggy = autoCategorize('Payment to Swiggy Bangalore', 'debit', mockCategories);
assert.equal(catSwiggy.categoryName, 'Food');

const catUber = autoCategorize('Payment to Uber India Ride', 'debit', mockCategories);
assert.equal(catUber.categoryName, 'Travel');

const catAmazon = autoCategorize('Payment to Amazon Retail India', 'debit', mockCategories);
assert.equal(catAmazon.categoryName, 'Shopping');

const catAirtel = autoCategorize('Payment to Airtel Prepaid Recharge', 'debit', mockCategories);
assert.equal(catAirtel.categoryName, 'Bills');

const catSalary = autoCategorize('Payment from Infosys Limited Salary', 'credit', mockCategories);
assert.equal(catSalary.categoryName, 'Salary');

const catCashback = autoCategorize('Cashback Reward from Cred', 'credit', mockCategories);
assert.equal(catCashback.categoryName, 'Bonus');

const catUnknownExpense = autoCategorize('Payment to Random Person X', 'debit', mockCategories);
assert.equal(catUnknownExpense.categoryName, 'Other Expense');
console.log('  ✅ PASS: Accurate auto-categorization across expense and income rules with safe fallbacks');

// ============================================================
// 6. Full Automated Statement Parsing & Deduplication Lifecycle
// ============================================================
console.log('--- Test Suite 6: Full Statement Parsing, Reversals & Deduplication ---');

const sampleUpiCsv = `,,,,Transaction History,,,,,,
Customer Mobile Number: +917780124320,,,,,,,Transaction History from 12/05/2026 to 08/11/2026,,,
Date,Time,Bank Name,Account Number,Sender,Receiver,Payment ID/Reference Number,Pay/Collect,Amount (in Rs.),DR/CR,Status
08/11/2026,10:20:24,UNION BANK OF INDIA,XXXX0189,xxxxx24320@upi(BHEEMA NITISH),swiggy@icici(Swiggy Order),102024302967,PAY,450,DR,SUCCESS
07/11/2026,14:07:39,UNION BANK OF INDIA,XXXX0189,payroll@infosys(Infosys Tech),xxxxx24320@upi(BHEEMA NITISH),830877339457,COLLECT,85000,CR,SUCCESS
07/11/2026,13:00:00,UNION BANK OF INDIA,XXXX0189,xxxxx24320@upi(BHEEMA NITISH),uber@axis(Uber Ride),998877665544,PAY,320,DR,FAILURE
06/11/2026,12:00:00,UNION BANK OF INDIA,XXXX0189,merchant@upi(Refund for Order),xxxxx24320@upi(BHEEMA NITISH),112233445566,COLLECT,450,CR,SUCCESS
08/11/2026,10:20:24,UNION BANK OF INDIA,XXXX0189,xxxxx24320@upi(BHEEMA NITISH),swiggy@icici(Swiggy Order),102024302967,PAY,450,DR,SUCCESS`;

const parsed1 = parseAndNormalizeStatement(sampleUpiCsv, {
  userId: 42,
  categories: mockCategories,
});

assert.equal(parsed1.formatId, 'upi_unified');
assert.equal(parsed1.isRecognized, true);
assert.equal(parsed1.successfulRows.length, 3, '3 successful unique rows');
assert.equal(parsed1.duplicateRows.length, 1, '1 duplicate row detected');
assert.equal(parsed1.skippedFailedRows.length, 1, '1 FAILURE status row skipped');

// Verify debit vs credit classification
assert.equal(parsed1.successfulRows[0].direction, 'debit');
assert.equal(parsed1.successfulRows[0].categoryName, 'Food');
assert.equal(parsed1.successfulRows[1].direction, 'credit');
assert.equal(parsed1.successfulRows[1].categoryName, 'Salary');
assert.equal(parsed1.successfulRows[2].direction, 'credit'); // Refund
assert.equal(parsed1.successfulRows[2].categoryName, 'Bonus');

// Verify second upload with existing fingerprints (100% deduplication)
const existingFingerprints = new Set(parsed1.successfulRows.map(r => r.fingerprint));
const parsed2 = parseAndNormalizeStatement(sampleUpiCsv, {
  userId: 42,
  categories: mockCategories,
  existingFingerprints,
});
assert.equal(parsed2.successfulRows.length, 0, 'Zero new rows imported on re-upload');
assert.equal(parsed2.duplicateRows.length, 4, 'All previously imported items marked duplicate');
console.log('  ✅ PASS: 100% duplicate prevention across re-uploads and failed rows skipped cleanly');

// ============================================================
// 7. Verify Local Statement Fixture If Available
// ============================================================
console.log('--- Test Suite 7: Local Fixture Validation (Transaction_Statement.csv) ---');
const localFixturePath = 'C:\\Users\\Nitish\\Downloads\\Transaction_Statement.csv';
if (fs.existsSync(localFixturePath)) {
  const fileContent = fs.readFileSync(localFixturePath, 'utf8');
  const fixtureRes = parseAndNormalizeStatement(fileContent, {
    userId: 99,
    categories: mockCategories,
  });

  assert.equal(fixtureRes.formatId, 'upi_unified');
  assert.equal(fixtureRes.isRecognized, true);
  assert.equal(fixtureRes.successfulRows.length, 932);
  assert.equal(fixtureRes.skippedFailedRows.length, 26);
  assert.equal(fixtureRes.invalidRows.length, 0);

  // Re-run for complete deduplication test
  const existingSet = new Set(fixtureRes.successfulRows.map(r => r.fingerprint));
  const reUploadRes = parseAndNormalizeStatement(fileContent, {
    userId: 99,
    categories: mockCategories,
    existingFingerprints: existingSet,
  });
  assert.equal(reUploadRes.successfulRows.length, 0);
  assert.equal(reUploadRes.duplicateRows.length, 932);
  console.log(`  ✅ PASS: Verified 958 rows in local fixture: 932 successful imported, 26 failed skipped, 100% deduplicated on re-upload`);
} else {
  console.log('  ℹ️  Notice: Local fixture Transaction_Statement.csv not in Downloads path, skipped file fixture');
}

console.log('\n========================================');
console.log('AutoTrack Automated Import Tests: All Passed!');
console.log('========================================\n');
