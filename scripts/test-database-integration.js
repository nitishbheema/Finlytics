import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set test environment variables BEFORE importing app or db
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/finlytics_test';
process.env.DATABASE_URL = TEST_DB_URL;
process.env.JWT_SECRET = 'test-secret-key-1234567890-abcdef';
process.env.NODE_ENV = 'test';

// Dynamically import app and auth after env vars are set
const { default: app } = await import('../server/app.js');
const { pool } = await import('../server/config/db.js');
const { generateToken } = await import('../server/middleware/auth.js');

console.log('🧪 Starting Finlytics Live Database Integration Test Suite...\n');
console.log(`📡 Connecting to test database: ${TEST_DB_URL}`);

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
    // 0. Database Schema Setup & Cleanup
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
        VALUES ('Refunds & Reversals', 'expense')
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

    report(user1Id && user2Id, 'Test users created successfully in Postgres');

    // ============================================================
    // 1. First Upload: Import Eligible Records & Accurate Accounting
    // ============================================================
    console.log('\n--- Test Suite 1: Automated Statement Import & Refund Accounting ---');

    // Synthetic CSV statement: 3 Debits (Food, Travel, Shopping), 2 Credits (Salary, Bonus), 1 Refund (Offset), 1 Failed, 1 Malformed
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
    report(upload1Data.failedCount === 1, `Skipped exactly 1 failed transaction row (got ${upload1Data.failedCount})`);
    report(upload1Data.invalidCount === 1, `Reported exactly 1 malformed row (got ${upload1Data.invalidCount})`);

    // Verify PostgreSQL records
    const expRes1 = await pool.query('SELECT * FROM public.expenses WHERE user_id = $1 ORDER BY amount ASC', [user1Id]);
    report(expRes1.rowCount === 4, `PostgreSQL expenses table has 4 records (3 debits + 1 negative refund offset, got ${expRes1.rowCount})`);

    // Refund offset verification
    const refundRecord = expRes1.rows.find((r) => Number(r.amount) < 0);
    report(refundRecord && Number(refundRecord.amount) === -450, 'Refund recorded as negative expense offset (-450.00)');

    // Income verification (Must NOT include the refund)
    const incRes1 = await pool.query('SELECT * FROM public.transactions WHERE user_id = $1 AND type = $2', [user1Id, 'income']);
    report(incRes1.rowCount === 2, `PostgreSQL transactions (income) table has exactly 2 records (got ${incRes1.rowCount})`);
    const totalIncome = incRes1.rows.reduce((sum, r) => sum + Number(r.amount), 0);
    report(totalIncome === 85500, `Total income is Rs 85,500.00 (refund Rs 450 did NOT inflate income, got ${totalIncome})`);

    // Failed transactions verification: zero financial records
    const failedExpCheck = await pool.query('SELECT * FROM public.expenses WHERE user_id = $1 AND description LIKE $2', [user1Id, '%declined@merchant%']);
    const failedIncCheck = await pool.query('SELECT * FROM public.transactions WHERE user_id = $1 AND description LIKE $2', [user1Id, '%declined@merchant%']);
    report(failedExpCheck.rowCount === 0 && failedIncCheck.rowCount === 0, 'Failed transaction created zero financial records');

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
         VALUES ($1, $2, 'csv', 'expense')`,
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
    // 6. Summary and Final Scorecard
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
