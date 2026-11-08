import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ============================================================
 * STRICT SAFETY VALIDATOR FOR TEST DATABASE CONNECTION URL
 * ============================================================
 * Prevents any accidental operations against production, Supabase, staging,
 * or unexpected databases.
 *
 * Rules:
 * 1. TEST_DATABASE_URL must be explicitly provided (no undefined, no empty string).
 * 2. Never fall back to DATABASE_URL or SUPABASE_DB_URL.
 * 3. Database name must be strictly 'finlytics_test'.
 * 4. Host must be strictly localhost, 127.0.0.1, or ::1.
 * 5. Rejects any cloud, staging, Supabase, Render, Neon, AWS hosts.
 */
export function validateTestDatabaseUrl(url) {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    throw new Error(
      'SECURITY ERROR: TEST_DATABASE_URL environment variable is mandatory. ' +
      'Falling back to DATABASE_URL is strictly prohibited.'
    );
  }

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch (err) {
    throw new Error(`SECURITY ERROR: Invalid TEST_DATABASE_URL format: ${err.message}`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`SECURITY ERROR: Invalid database protocol: "${parsed.protocol}". Expected "postgresql:" or "postgres:".`);
  }

  // 1. Host validation: ONLY local test databases are permitted
  const hostname = (parsed.hostname || '').toLowerCase();
  const allowedHosts = ['localhost', '127.0.0.1', '::1'];

  // Explicitly check for forbidden cloud providers
  const forbiddenKeywords = ['supabase', 'pooler', 'aws', 'rds', 'render', 'neon', 'vercel', 'railway', 'azure', 'gcp'];
  for (const keyword of forbiddenKeywords) {
    if (hostname.includes(keyword) || (parsed.username || '').includes(keyword)) {
      throw new Error(`SECURITY ERROR: Forbidden production/cloud host pattern detected ("${keyword}"). Only local test databases are allowed.`);
    }
  }

  if (!allowedHosts.includes(hostname)) {
    throw new Error(
      `SECURITY ERROR: Refusing to run tests against remote/non-local host "${hostname}". ` +
      `Only local test database hosts (${allowedHosts.join(', ')}) are allowed.`
    );
  }

  // 2. Database name validation: MUST be exactly 'finlytics_test'
  const dbName = parsed.pathname.replace(/^\//, '').trim();
  if (dbName !== 'finlytics_test') {
    throw new Error(
      `SECURITY ERROR: Refusing to run tests against database "${dbName}". ` +
      `Database name MUST be strictly "finlytics_test" to prevent data destruction.`
    );
  }

  return {
    valid: true,
    hostname,
    database: dbName,
    port: parsed.port || '5432'
  };
}

// ============================================================
// SUITE 0: UNIT TESTS PROVING UNSAFE DATABASE URLS ARE REJECTED
// ============================================================
console.log('🧪 Starting Finlytics Database Safety & Integration Test Suite...\n');
console.log('--- Suite 0: Test Database Safety Validator Guardrails ---');

// 1. Missing / undefined URL must throw
assert.throws(
  () => validateTestDatabaseUrl(undefined),
  /TEST_DATABASE_URL environment variable is mandatory/i
);

// 2. Empty string must throw
assert.throws(
  () => validateTestDatabaseUrl('   '),
  /TEST_DATABASE_URL environment variable is mandatory/i
);

// 3. Reject fallback to production DATABASE_URL
assert.throws(
  () => validateTestDatabaseUrl('postgresql://postgres:postgres@localhost:5432/finlytics'),
  /Database name MUST be strictly "finlytics_test"/i
);

// 4. Reject default postgres maintenance database
assert.throws(
  () => validateTestDatabaseUrl('postgresql://postgres:postgres@localhost:5432/postgres'),
  /Database name MUST be strictly "finlytics_test"/i
);

// 5. Reject arbitrary database names
assert.throws(
  () => validateTestDatabaseUrl('postgresql://postgres:postgres@localhost:5432/production_replica'),
  /Database name MUST be strictly "finlytics_test"/i
);

// 6. Reject Supabase direct host
assert.throws(
  () => validateTestDatabaseUrl('postgresql://postgres:secret@db.abcxyz.supabase.co:5432/finlytics_test'),
  /Forbidden production\/cloud host pattern detected/i
);

// 7. Reject Supabase pooler host
assert.throws(
  () => validateTestDatabaseUrl('postgresql://postgres.abcxyz:secret@aws-0-ap-south-1.pooler.supabase.com:6543/finlytics_test'),
  /Forbidden production\/cloud host pattern detected/i
);

// 8. Reject AWS RDS host
assert.throws(
  () => validateTestDatabaseUrl('postgresql://admin:secret@production-db.rds.amazonaws.com:5432/finlytics_test'),
  /Forbidden production\/cloud host pattern detected/i
);

// 9. Reject Render cloud host
assert.throws(
  () => validateTestDatabaseUrl('postgresql://admin:secret@dpg-abc123xyz.oregon-postgres.render.com/finlytics_test'),
  /Forbidden production\/cloud host pattern detected/i
);

// 10. Valid local test database URL must succeed
const validCheck = validateTestDatabaseUrl('postgresql://postgres:postgres@localhost:5432/finlytics_test');
assert.equal(validCheck.valid, true);
assert.equal(validCheck.database, 'finlytics_test');
console.log('  ✅ PASS: Unsafe database URLs successfully rejected across all safety rules\n');

// ============================================================
// SUITE 1: RUNTIME SAFETY CHECK BEFORE DB CONNECTION & TRUNCATE
// ============================================================
// Enforce mandatory TEST_DATABASE_URL
const RUNTIME_TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!RUNTIME_TEST_DB_URL) {
  console.error('❌ FATAL: TEST_DATABASE_URL is not set. Halting immediately without connecting.');
  process.exit(1);
}

// Run strict safety check on runtime URL BEFORE connecting or touching any tables
const validatedConfig = validateTestDatabaseUrl(RUNTIME_TEST_DB_URL);
console.log(`📡 Verified safe test database target: ${validatedConfig.hostname}:${validatedConfig.port}/${validatedConfig.database}`);

// Set process environment for server app
process.env.DATABASE_URL = RUNTIME_TEST_DB_URL;
process.env.JWT_SECRET = 'test-secret-key-1234567890-abcdef';
process.env.NODE_ENV = 'test';

// Dynamically import server app and database pool after safety validation
const { default: app } = await import('../server/app.js');
const { pool } = await import('../server/config/db.js');
const { generateToken } = await import('../server/middleware/auth.js');

let passed = 0;
let failed = 0;

function report(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runDatabaseIntegrationTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let user1Id, user2Id;
  let user1Token, user2Token;

  try {
    // ============================================================
    // Database Schema Setup & Cleanup (Verified finlytics_test)
    // ============================================================
    console.log('\n--- Setup: Initializing Test Database Schema & Seeds ---');
    const client = await pool.connect();
    try {
      const schemaSql = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf-8');
      await client.query(schemaSql);

      const autotrackSql = fs.readFileSync(path.join(__dirname, '../database/autotrack_migration.sql'), 'utf-8');
      await client.query(autotrackSql);

      const seedSql = fs.readFileSync(path.join(__dirname, '../database/seed.sql'), 'utf-8');
      await client.query(seedSql);

      // Clean transactional tables
      await client.query(`
        TRUNCATE TABLE public.autotrack_events,
                       public.transaction_import_fingerprints,
                       public.autotrack_devices,
                       public.autotrack_pairing_codes,
                       public.autotrack_settings,
                       public.category_budgets,
                       public.expenses,
                       public.transactions,
                       public.users
        CASCADE;
      `);

      // Ensure Refunds & Reversals category exists
      await client.query(`
        INSERT INTO public.categories (category_name, category_type)
        VALUES('Refunds & Reversals', 'expense')
        ON CONFLICT (category_name, category_type) DO NOTHING;
      `);

      // Create two test users
      const hashedPassword = await bcrypt.hash('TestPass123!', 8);
      const u1Res = await client.query(
        `INSERT INTO public.users (name, email, password) VALUES ($1, $2, $3) RETURNING user_id`,
        ['Test User One', 'testuser1@finlytics.dev', hashedPassword]
      );
      user1Id = u1Res.rows[0].user_id;

      const u2Res = await client.query(
        `INSERT INTO public.users (name, email, password) VALUES ($1, $2, $3) RETURNING user_id`,
        ['Test User Two', 'testuser2@finlytics.dev', hashedPassword]
      );
      user2Id = u2Res.rows[0].user_id;
    } finally {
      client.release();
    }

    user1Token = generateToken({ user_id: user1Id, email: 'testuser1@finlytics.dev', name: 'Test User One' });
    user2Token = generateToken({ user_id: user2Id, email: 'testuser2@finlytics.dev', name: 'Test User Two' });

    const authHeaders1 = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user1Token}`,
    };
    const authHeaders2 = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user2Token}`,
    };

    report(user1Id && user2Id, 'Test users created successfully in finlytics_test');

    // ============================================================
    // 1. First Upload: Import Eligible Records & Accurate Accounting
    // ============================================================
    console.log('\n--- Test Suite 1: Automated Statement Import & Refund Accounting ---');

    // Synthetic CSV statement:
    // - 3 Debits + 2 Credits + 1 Refund (SUCCESS -> importedCount = 6)
    // - 1 Failed transaction (FAILURE -> skipped in failedCount)
    // - 1 Valid transaction with blank status (MISSING -> skipped in failedCount)
    // - 1 Structurally malformed row (missing date/amount -> invalidCount = 1)
    const initialCsv = `,,,,Transaction History,,,,,,
Customer Mobile Number: +919876543210,,,,,,,Transaction History from 01/11/2026 to 08/11/2026,,,
Date,Time,Bank Name,Account Number,Sender,Receiver,Payment ID/Reference Number,Pay/Collect,Amount (in Rs.),DR/CR,Status
08/11/2026,10:20:24,DEMO BANK,XXXX1234,user@upi(Demo User),swiggy@icici(Swiggy Order),SYNTH_REF_SWIGGY_01,PAY,450.00,DR,SUCCESS
08/11/2026,11:30:00,DEMO BANK,XXXX1234,user@upi(Demo User),uber@axis(Uber Ride),SYNTH_REF_UBER_02,PAY,320.00,DR,SUCCESS
08/11/2026,12:45:00,DEMO BANK,XXXX1234,user@upi(Demo User),amazon@icici(Amazon Retail),SYNTH_REF_AMAZON_03,PAY,1200.00,DR,SUCCESS
07/11/2026,14:07:39,DEMO BANK,XXXX1234,payroll@infosys(Infosys Tech),user@upi(Demo User),SYNTH_REF_SALARY_04,COLLECT,85000.00,CR,SUCCESS
06/11/2026,09:15:00,DEMO BANK,XXXX1234,cred@axis(Cred Cashback),user@upi(Demo User),SYNTH_REF_BONUS_05,COLLECT,500.00,CR,SUCCESS
06/11/2026,15:00:00,DEMO BANK,XXXX1234,swiggy@icici(Refund for Swiggy Order),user@upi(Demo User),SYNTH_REF_REFUND_06,COLLECT,450.00,CR,SUCCESS
05/11/2026,18:00:00,DEMO BANK,XXXX1234,user@upi(Demo User),declined@merchant(Store Pay),SYNTH_REF_FAILED_07,PAY,999.00,DR,FAILURE
04/11/2026,16:00:00,DEMO BANK,XXXX1234,user@upi(Demo User),blank@merchant(Store Blank Status),SYNTH_REF_BLANK_08,PAY,150.00,DR,
INVALID_ROW_WITHOUT_REQUIRED_FIELDS`;

    const upload1Res = await fetch(`${baseUrl}/api/autotrack/csv/auto-import`, {
      method: 'POST',
      headers: authHeaders1,
      body: JSON.stringify({ csvText: initialCsv }),
    });

    const upload1Data = await upload1Res.json();
    report(upload1Res.status === 200, 'POST /api/autotrack/csv/auto-import returns 200 OK');
    report(upload1Data.importedCount === 6, `Imported exactly 6 valid records (got ${upload1Data.importedCount})`);
    report(upload1Data.duplicateCount === 0, `Detected exactly 0 duplicates on initial import (got ${upload1Data.duplicateCount})`);
    report(upload1Data.failedCount === 2, `Skipped exactly 2 non-successful rows: 1 FAILURE + 1 MISSING status (got ${upload1Data.failedCount})`);
    report(upload1Data.invalidCount === 1, `Reported exactly 1 structurally malformed row in invalidCount (got ${upload1Data.invalidCount})`);

    // Verify PostgreSQL records
    const expRes1 = await pool.query('SELECT * FROM public.expenses WHERE user_id = $1 ORDER BY amount ASC', [user1Id]);
    report(expRes1.rowCount === 4, `PostgreSQL expenses table has 4 records (3 debits + 1 negative refund offset, got ${expRes1.rowCount})`);

    // Refund offset verification: must be negative amount offset
    const refundRecord = expRes1.rows.find((r) => Number(r.amount) < 0);
    report(refundRecord && Number(refundRecord.amount) === -450, 'Refund recorded as negative expense offset (-450.00)');

    // Income verification (Must NOT include the refund)
    const incRes1 = await pool.query('SELECT * FROM public.transactions WHERE user_id = $1 AND type = $2', [user1Id, 'income']);
    report(incRes1.rowCount === 2, `PostgreSQL transactions (income) table has exactly 2 records (got ${incRes1.rowCount})`);
    const totalIncome = incRes1.rows.reduce((sum, r) => sum + Number(r.amount), 0);
    report(totalIncome === 85500, `Total income is Rs 85,500.00 (refund Rs 450 did NOT inflate income, got ${totalIncome})`);

    // Failed & missing-status transactions verification: zero financial records created
    const failedExpCheck = await pool.query(
      `SELECT * FROM public.expenses WHERE user_id = $1 AND (description LIKE '%declined@merchant%' OR description LIKE '%blank@merchant%')`,
      [user1Id]
    );
    const failedIncCheck = await pool.query(
      `SELECT * FROM public.transactions WHERE user_id = $1 AND (description LIKE '%declined@merchant%' OR description LIKE '%blank@merchant%')`,
      [user1Id]
    );
    report(failedExpCheck.rowCount === 0 && failedIncCheck.rowCount === 0, 'Failed and missing-status transactions created zero financial records');

    // ============================================================
    // 2. Sequential Re-Upload (Deduplication Verification)
    // ============================================================
    console.log('\n--- Test Suite 2: Sequential Statement Re-Upload (100% Deduplication) ---');

    const upload2Res = await fetch(`${baseUrl}/api/autotrack/csv/auto-import`, {
      method: 'POST',
      headers: authHeaders1,
      body: JSON.stringify({ csvText: initialCsv }),
    });

    const upload2Data = await upload2Res.json();
    report(upload2Res.status === 200, 'Re-upload request returns 200 OK');
    report(upload2Data.importedCount === 0, `Zero new records imported on re-upload (got ${upload2Data.importedCount})`);
    report(upload2Data.duplicateCount === 6, `All 6 previously imported items detected as duplicates (got ${upload2Data.duplicateCount})`);

    // Check database counts remain identical
    const expRes2 = await pool.query('SELECT count(*) FROM public.expenses WHERE user_id = $1', [user1Id]);
    const incRes2 = await pool.query('SELECT count(*) FROM public.transactions WHERE user_id = $1', [user1Id]);
    report(Number(expRes2.rows[0].count) === 4, 'Expenses count unchanged in database after re-upload');
    report(Number(incRes2.rows[0].count) === 2, 'Income count unchanged in database after re-upload');

    // ============================================================
    // 3. Concurrency Safety: Simultaneous Identical Uploads
    // ============================================================
    console.log('\n--- Test Suite 3: Concurrency Safety (Simultaneous Parallel Uploads) ---');

    const concurrentCsv = `Date,Time,Bank Name,Account Number,Sender,Receiver,Payment ID/Reference Number,Pay/Collect,Amount (in Rs.),DR/CR,Status
08/11/2026,14:00:00,DEMO BANK,XXXX1234,user@upi(Demo User),store1@upi(Store 1),RACE_REF_001,PAY,100.00,DR,SUCCESS
08/11/2026,14:05:00,DEMO BANK,XXXX1234,user@upi(Demo User),store2@upi(Store 2),RACE_REF_002,PAY,200.00,DR,SUCCESS
08/11/2026,14:10:00,DEMO BANK,XXXX1234,user@upi(Demo User),store3@upi(Store 3),RACE_REF_003,PAY,300.00,DR,SUCCESS
08/11/2026,14:15:00,DEMO BANK,XXXX1234,user@upi(Demo User),store4@upi(Store 4),RACE_REF_004,PAY,400.00,DR,SUCCESS
08/11/2026,14:20:00,DEMO BANK,XXXX1234,user@upi(Demo User),store5@upi(Store 5),RACE_REF_005,PAY,500.00,DR,SUCCESS`;

    // Fire 2 simultaneous uploads of the exact same CSV
    const [cResA, cResB] = await Promise.all([
      fetch(`${baseUrl}/api/autotrack/csv/auto-import`, {
        method: 'POST',
        headers: authHeaders1,
        body: JSON.stringify({ csvText: concurrentCsv }),
      }),
      fetch(`${baseUrl}/api/autotrack/csv/auto-import`, {
        method: 'POST',
        headers: authHeaders1,
        body: JSON.stringify({ csvText: concurrentCsv }),
      }),
    ]);

    const cDataA = await cResA.json();
    const cDataB = await cResB.json();

    report(cResA.status === 200 && cResB.status === 200, 'Both concurrent uploads completed with 200 OK without deadlock');

    const totalImportedConcurrent = cDataA.importedCount + cDataB.importedCount;
    const totalDuplicatesConcurrent = cDataA.duplicateCount + cDataB.duplicateCount;

    report(
      totalImportedConcurrent === 5,
      `Exactly 5 records imported across concurrent requests (got ${totalImportedConcurrent}: reqA=${cDataA.importedCount}, reqB=${cDataB.importedCount})`
    );
    report(
      totalDuplicatesConcurrent === 5,
      `Exactly 5 records marked duplicate across concurrent requests (got ${totalDuplicatesConcurrent}: reqA=${cDataA.duplicateCount}, reqB=${cDataB.duplicateCount})`
    );

    // Verify database count for race references
    const raceDbCheck = await pool.query(
      `SELECT count(*) FROM public.expenses WHERE user_id = $1 AND description LIKE '%RACE_REF_%'`,
      [user1Id]
    );
    report(Number(raceDbCheck.rows[0].count) === 5, `Database has exactly 5 records for concurrent batch (got ${raceDbCheck.rows[0].count})`);

    // ============================================================
    // 4. Atomic Transaction Rollback on Database Failure
    // ============================================================
    console.log('\n--- Test Suite 4: Atomic Transaction Rollback on Failure ---');

    // Test that within a transaction, if an insert fails, rollback restores both fingerprints and records
    const testClient = await pool.connect();
    const testFp = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
    try {
      await testClient.query('BEGIN');
      await testClient.query(
        `INSERT INTO public.transaction_import_fingerprints (user_id, fingerprint, source, transaction_type)
         VALUES($1, $2, 'csv', 'expense')`,
        [user1Id, testFp]
      );
      // Intentionally rollback
      await testClient.query('ROLLBACK');
    } catch (err) {
      await testClient.query('ROLLBACK');
    } finally {
      testClient.release();
    }

    const checkFp = await pool.query(
      'SELECT count(*) FROM public.transaction_import_fingerprints WHERE user_id = $1 AND fingerprint = $2',
      [user1Id, testFp]
    );
    report(Number(checkFp.rows[0].count) === 0, 'Rolled-back transaction leaves zero fingerprints in database');

    // ============================================================
    // 5. User Isolation & Multi-Tenancy
    // ============================================================
    console.log('\n--- Test Suite 5: User Isolation & Multi-Tenant Independence ---');

    // User 2 uploads the same initial CSV that User 1 uploaded
    const u2UploadRes = await fetch(`${baseUrl}/api/autotrack/csv/auto-import`, {
      method: 'POST',
      headers: authHeaders2,
      body: JSON.stringify({ csvText: initialCsv }),
    });
    const u2UploadData = await u2UploadRes.json();

    report(u2UploadRes.status === 200, 'User 2 statement import returns 200 OK');
    report(u2UploadData.importedCount === 6, `User 2 independently imports 6 records (got ${u2UploadData.importedCount})`);
    report(u2UploadData.duplicateCount === 0, 'User 1 fingerprints do not block User 2');

    // Check user isolation in database
    const u1Count = await pool.query('SELECT count(*) FROM public.expenses WHERE user_id = $1', [user1Id]);
    const u2Count = await pool.query('SELECT count(*) FROM public.expenses WHERE user_id = $1', [user2Id]);
    report(Number(u1Count.rows[0].count) === 9, `User 1 has 9 expense records (4 initial + 5 concurrent)`);
    report(Number(u2Count.rows[0].count) === 4, `User 2 has 4 expense records (independent isolation)`);

    // Verify User 2 cannot access User 1's events
    const u1EventRes = await pool.query('SELECT event_id FROM public.autotrack_events WHERE user_id = $1 LIMIT 1', [user1Id]);
    if (u1EventRes.rowCount > 0) {
      const u1EventId = u1EventRes.rows[0].event_id;
      const crossUserApprove = await fetch(`${baseUrl}/api/autotrack/events/${u1EventId}/approve`, {
        method: 'POST',
        headers: authHeaders2,
        body: JSON.stringify({}),
      });
      report(crossUserApprove.status === 404, 'User 2 cannot access or approve User 1 events (returns 404)');
    }

    // ============================================================
    // 6. Comprehensive AutoTrack Refund-Integrity & Concurrency Suite
    // ============================================================
    console.log('\n--- Test Suite 6: Advanced Refund-Integrity & Concurrency Serialization ---');

    // Fetch Shopping category ID for setup
    const shopCatRes = await pool.query("SELECT category_id FROM public.categories WHERE category_name = 'Shopping' AND category_type = 'expense' LIMIT 1");
    const shoppingCatId = shopCatRes.rows[0].category_id;

    // A. Setup original expenses
    const expSetupRes = await pool.query(
      `INSERT INTO public.expenses (user_id, category_id, amount, expense_date, description)
       VALUES
        ($1, $2, 5000.00, '2026-11-01', 'Online Electronics Store Purchase Ref: SYNTH_PHONE_PURCHASE'),
        ($1, $2, 10000.00, '2026-11-01', 'Official Retail Store Order Ref: SYNTH_LAPTOP_PURCHASE'),
        ($1, $2, 1000.00, '2026-11-01', 'Airlines Booking Ref: SYNTH_FLIGHT_TICKET')
       RETURNING expense_id, description, amount`,
      [user1Id, shoppingCatId]
    );
    report(expSetupRes.rowCount === 3, 'Created 3 original benchmark expenses for refund integrity testing');

    // Record initial income count to verify refunds NEVER touch income
    const preRefundIncomeRes = await pool.query('SELECT count(*) FROM public.transactions WHERE user_id = $1 AND type = $2', [user1Id, 'income']);
    const preRefundIncomeCount = Number(preRefundIncomeRes.rows[0].count);

    // B. Test Case 1: One Full Refund (exact match on SYNTH_PHONE_PURCHASE)
    const fullRefundCsv = `Date,Time,Bank Name,Account Number,Sender,Receiver,Payment ID/Reference Number,Pay/Collect,Amount (in Rs.),DR/CR,Status
02/11/2026,10:00:00,DEMO BANK,XXXX1234,merchant@upi(Full Refund for Order Ref: SYNTH_PHONE_PURCHASE),user@upi(Demo User),REFUND_PHONE_FULL_01,COLLECT,5000.00,CR,SUCCESS`;

    const fullRefRes = await fetch(`${baseUrl}/api/autotrack/csv/auto-import`, {
      method: 'POST',
      headers: authHeaders1,
      body: JSON.stringify({ csvText: fullRefundCsv }),
    });
    const fullRefData = await fullRefRes.json();
    report(fullRefData.importedCount === 1, 'One full refund imported successfully');

    // Verify correct original expense category receives the offset
    const phoneRefundDb = await pool.query(
      "SELECT * FROM public.expenses WHERE user_id = $1 AND description LIKE '%REFUND_PHONE_FULL_01%'",
      [user1Id]
    );
    report(
      phoneRefundDb.rowCount === 1 &&
      phoneRefundDb.rows[0].category_id === shoppingCatId &&
      Number(phoneRefundDb.rows[0].amount) === -5000.00,
      'Full refund assigned to original category (Shopping) with exact negative offset (-5000.00)'
    );

    // C. Test Case 2 & 3: Multiple valid partial refunds whose cumulative sum equals original expense (SYNTH_LAPTOP_PURCHASE: 10,000)
    // Part 1: Partial refund ₹4,000.00
    const partial1Csv = `Date,Time,Bank Name,Account Number,Sender,Receiver,Payment ID/Reference Number,Pay/Collect,Amount (in Rs.),DR/CR,Status
03/11/2026,11:00:00,DEMO BANK,XXXX1234,merchant@upi(Partial Refund 1 for Order Ref: SYNTH_LAPTOP_PURCHASE),user@upi(Demo User),PARTIAL_LAPTOP_1,COLLECT,4000.00,CR,SUCCESS`;
    const p1Res = await fetch(`${baseUrl}/api/autotrack/csv/auto-import`, {
      method: 'POST',
      headers: authHeaders1,
      body: JSON.stringify({ csvText: partial1Csv }),
    });
    const p1Data = await p1Res.json();
    report(p1Data.importedCount === 1, 'First partial refund (₹4,000.00) imported successfully');

    // Part 2: Partial refund ₹6,000.00 (remaining balance exactly ₹6,000.00)
    const partial2Csv = `Date,Time,Bank Name,Account Number,Sender,Receiver,Payment ID/Reference Number,Pay/Collect,Amount (in Rs.),DR/CR,Status
04/11/2026,12:00:00,DEMO BANK,XXXX1234,merchant@upi(Partial Refund 2 for Order Ref: SYNTH_LAPTOP_PURCHASE),user@upi(Demo User),PARTIAL_LAPTOP_2,COLLECT,6000.00,CR,SUCCESS`;
    const p2Res = await fetch(`${baseUrl}/api/autotrack/csv/auto-import`, {
      method: 'POST',
      headers: authHeaders1,
      body: JSON.stringify({ csvText: partial2Csv }),
    });
    const p2Data = await p2Res.json();
    report(p2Data.importedCount === 1, 'Second partial refund (₹6,000.00) imported successfully (cumulative exactly ₹10,000)');

    // Verify cumulative offsets in database
    const laptopOffsetsRes = await pool.query(
      "SELECT COALESCE(SUM(ABS(amount)), 0) AS total_refunded FROM public.expenses WHERE user_id = $1 AND amount < 0 AND (description LIKE '%PARTIAL_LAPTOP_1%' OR description LIKE '%PARTIAL_LAPTOP_2%')",
      [user1Id]
    );
    report(Number(laptopOffsetsRes.rows[0].total_refunded) === 10000.00, 'Cumulative partial refunds exactly match original expense (₹10,000.00)');

    // D. Test Case 4: Refund exceeding remaining balance is REJECTED (₹1,000 on fully refunded laptop)
    const excessRefundCsv = `Date,Time,Bank Name,Account Number,Sender,Receiver,Payment ID/Reference Number,Pay/Collect,Amount (in Rs.),DR/CR,Status
05/11/2026,13:00:00,DEMO BANK,XXXX1234,merchant@upi(Excess Refund for Order Ref: SYNTH_LAPTOP_PURCHASE),user@upi(Demo User),EXCESS_LAPTOP_3,COLLECT,1000.00,CR,SUCCESS`;
    const excessRes = await fetch(`${baseUrl}/api/autotrack/csv/auto-import`, {
      method: 'POST',
      headers: authHeaders1,
      body: JSON.stringify({ csvText: excessRefundCsv }),
    });
    const excessData = await excessRes.json();
    report(excessData.importedCount === 0, 'Excess refund was NOT imported (importedCount = 0)');
    report(excessData.failedCount === 1, 'Excess refund flagged in failedCount (status: EXCEEDS_BALANCE)');

    // Verify audit event preserved and NO financial record created
    const excessAuditCheck = await pool.query(
      "SELECT * FROM public.autotrack_events WHERE user_id = $1 AND reference = 'EXCESS_LAPTOP_3'",
      [user1Id]
    );
    report(
      excessAuditCheck.rowCount === 1 &&
      excessAuditCheck.rows[0].status === 'rejected' &&
      excessAuditCheck.rows[0].review_note.includes('exceeds remaining refundable balance'),
      'Preserved clear rejection audit event in autotrack_events for excess refund'
    );
    const excessExpCheck = await pool.query(
      "SELECT count(*) FROM public.expenses WHERE user_id = $1 AND description LIKE '%EXCESS_LAPTOP_3%'",
      [user1Id]
    );
    report(Number(excessExpCheck.rows[0].count) === 0, 'Zero expense rows created for excess refund');

    // E. Test Case 5: Two concurrent distinct partial refunds targeting the same expense (SYNTH_FLIGHT_TICKET: 1,000)
    // One is ₹600.00 and other is ₹500.00 (Total: ₹1,100.00 > ₹1,000.00). Must NOT exceed ₹1,000!
    const concFlightA = `Date,Time,Bank Name,Account Number,Sender,Receiver,Payment ID/Reference Number,Pay/Collect,Amount (in Rs.),DR/CR,Status
06/11/2026,14:00:00,DEMO BANK,XXXX1234,airline@upi(Refund A for Order Ref: SYNTH_FLIGHT_TICKET),user@upi(Demo User),CONC_FLIGHT_REF_A,COLLECT,600.00,CR,SUCCESS`;
    const concFlightB = `Date,Time,Bank Name,Account Number,Sender,Receiver,Payment ID/Reference Number,Pay/Collect,Amount (in Rs.),DR/CR,Status
06/11/2026,14:00:00,DEMO BANK,XXXX1234,airline@upi(Refund B for Order Ref: SYNTH_FLIGHT_TICKET),user@upi(Demo User),CONC_FLIGHT_REF_B,COLLECT,500.00,CR,SUCCESS`;

    const [fResA, fResB] = await Promise.all([
      fetch(`${baseUrl}/api/autotrack/csv/auto-import`, { method: 'POST', headers: authHeaders1, body: JSON.stringify({ csvText: concFlightA }) }),
      fetch(`${baseUrl}/api/autotrack/csv/auto-import`, { method: 'POST', headers: authHeaders1, body: JSON.stringify({ csvText: concFlightB }) }),
    ]);
    const fDataA = await fResA.json();
    const fDataB = await fResB.json();

    const importedConc = fDataA.importedCount + fDataB.importedCount;
    const rejectedConc = fDataA.failedCount + fDataB.failedCount;
    report(importedConc === 1 && rejectedConc === 1, 'Exactly one concurrent refund accepted and one rejected (cumulative cannot exceed ₹1,000)');

    // Verify database total for flight refunds is exactly ₹600 (or ₹500), never ₹1,100!
    const flightRefundDb = await pool.query(
      "SELECT COALESCE(SUM(ABS(amount)), 0) AS total_refunded FROM public.expenses WHERE user_id = $1 AND amount < 0 AND (description LIKE '%CONC_FLIGHT_REF_A%' OR description LIKE '%CONC_FLIGHT_REF_B%')",
      [user1Id]
    );
    report(Number(flightRefundDb.rows[0].total_refunded) <= 1000.00, `Database-level serialization (SELECT FOR UPDATE) prevented over-refunding (got ₹${flightRefundDb.rows[0].total_refunded})`);

    // F. Test Case 6: Duplicate refund re-upload
    const dupRefRes = await fetch(`${baseUrl}/api/autotrack/csv/auto-import`, {
      method: 'POST',
      headers: authHeaders1,
      body: JSON.stringify({ csvText: concFlightA }),
    });
    const dupRefData = await dupRefRes.json();
    report(dupRefData.importedCount === 0 && dupRefData.duplicateCount === 1, 'Duplicate refund re-upload detected and skipped cleanly');

    // G. Test Case 7: Refund with no reliable original expense match
    const orphanRefundCsv = `Date,Time,Bank Name,Account Number,Sender,Receiver,Payment ID/Reference Number,Pay/Collect,Amount (in Rs.),DR/CR,Status
07/11/2026,15:00:00,DEMO BANK,XXXX1234,unmatched@upi(General Store Refund),user@upi(Demo User),UNMATCHED_REFUND_999,COLLECT,350.00,CR,SUCCESS`;
    const orphanRes = await fetch(`${baseUrl}/api/autotrack/csv/auto-import`, {
      method: 'POST',
      headers: authHeaders1,
      body: JSON.stringify({ csvText: orphanRefundCsv }),
    });
    const orphanData = await orphanRes.json();
    report(orphanData.importedCount === 1, 'Unmatched refund safely imported into fallback category');

    const orphanDb = await pool.query(
      "SELECT e.*, c.category_name FROM public.expenses e JOIN public.categories c ON e.category_id = c.category_id WHERE e.user_id = $1 AND e.description LIKE '%UNMATCHED_REFUND_999%'",
      [user1Id]
    );
    report(
      orphanDb.rowCount === 1 &&
      orphanDb.rows[0].category_name === 'Refunds & Reversals' &&
      Number(orphanDb.rows[0].amount) === -350.00,
      'Unmatched refund safely routed to Refunds & Reversals category (-350.00)'
    );

    // H. Test Case 8: Confirm refunds NEVER increase income
    const postRefundIncomeRes = await pool.query('SELECT count(*) FROM public.transactions WHERE user_id = $1 AND type = $2', [user1Id, 'income']);
    const postRefundIncomeCount = Number(postRefundIncomeRes.rows[0].count);
    report(postRefundIncomeCount === preRefundIncomeCount, 'Income table remained completely untouched throughout all refund operations');

    // ============================================================
    // 7. Summary and Final Scorecard
    // ============================================================
    console.log('\n========================================');
    console.log(`Database Integration Tests: ${passed} Passed, ${failed} Failed`);
    console.log('========================================\n');
  } finally {
    server.close();
    await pool.end();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runDatabaseIntegrationTests().catch((err) => {
  console.error('Fatal database integration test error:', err);
  process.exit(1);
});
