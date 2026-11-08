import crypto from 'node:crypto';
import express from 'express';
import { pool, query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { authenticateAutoTrackDevice } from '../middleware/deviceAuth.js';
import { cleanText, fingerprintForUser, normalizeNotificationEvent, sha256 } from '../utils/autotrack.js';
import {
  detectDelimiter,
  parseCSV,
  findHeaderRowIndex,
  guessColumnMapping,
  detectStatementFormat,
  parseStatementRows,
  parseAndNormalizeStatement,
} from '../utils/csvParser.js';

const router = express.Router();
const MAX_EVENTS_PER_BATCH = 25;
const MAX_CSV_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.use(express.json({ limit: '10mb' }));

/**
 * Helper to ensure a deterministic Web Statement device exists for the user
 * to satisfy legacy foreign key and NOT NULL constraints if migration has not altered column.
 */
async function getOrCreateWebDevice(client, userId) {
  try {
    const existing = await client.query(
      `SELECT device_id FROM public.autotrack_devices WHERE user_id = $1 AND device_name = 'Web Statement Importer' LIMIT 1`,
      [userId]
    );
    if (existing.rowCount > 0) {
      return existing.rows[0].device_id;
    }

    const deviceId = crypto.randomUUID();
    const tokenHash = sha256(`web-device-${userId}-${deviceId}`);
    await client.query(
      `INSERT INTO public.autotrack_devices (device_id, user_id, device_name, token_hash)
       VALUES ($1, $2, 'Web Statement Importer', $3)
       ON CONFLICT DO NOTHING`,
      [deviceId, userId, tokenHash]
    );
    return deviceId;
  } catch (err) {
    return null;
  }
}

/**
 * Helper to find fallback category for expense or income
 */
async function findFallbackCategory(client, type) {
  const preferred = type === 'expense' ? 'other expense' : 'other income';
  const result = await client.query(
    `SELECT category_id, category_name FROM public.categories
      WHERE category_type = $1
      ORDER BY CASE WHEN LOWER(category_name) = $2 THEN 0 ELSE 1 END, category_id
      LIMIT 1`,
    [type, preferred]
  );
  return result.rows[0] || null;
}

/**
 * Helper to insert single event into core tables
 */
async function importEvent(client, event, userId, categoryId = null, source = 'csv') {
  const type = event.direction === 'debit' ? 'expense' : 'income';
  let targetCategoryId = categoryId;
  if (targetCategoryId) {
    const category = await client.query(
      'SELECT category_id FROM public.categories WHERE category_id = $1 AND category_type = $2',
      [targetCategoryId, type]
    );
    if (category.rowCount === 0) throw new Error(`Choose a valid ${type} category.`);
  } else {
    const fallback = await findFallbackCategory(client, type);
    targetCategoryId = fallback?.category_id;
  }
  if (!targetCategoryId) throw new Error(`No ${type} category is configured.`);

  const fingerprint = event.fingerprint;

  let claim;
  try {
    claim = await client.query(
      `INSERT INTO public.transaction_import_fingerprints (user_id, fingerprint, source, transaction_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, fingerprint) DO NOTHING
       RETURNING import_id`,
      [userId, fingerprint, source, type]
    );
  } catch (err) {
    claim = { rowCount: 1, rows: [{ import_id: null }] };
  }

  if (claim.rowCount === 0) return { duplicate: true };

  let inserted;
  if (type === 'expense') {
    inserted = await client.query(
      `INSERT INTO public.expenses (user_id, category_id, amount, expense_date, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING expense_id`,
      [userId, targetCategoryId, event.amount, event.transaction_date, event.description || event.merchant]
    );
    if (claim.rows[0]?.import_id) {
      await client.query('UPDATE public.transaction_import_fingerprints SET record_id = $1 WHERE import_id = $2', [
        inserted.rows[0].expense_id,
        claim.rows[0].import_id,
      ]);
    }
    return { duplicate: false, type, recordId: inserted.rows[0].expense_id };
  }

  inserted = await client.query(
    `INSERT INTO public.transactions (user_id, category_id, amount, type, description, transaction_date)
     VALUES ($1, $2, $3, 'income', $4, $5) RETURNING transaction_id`,
    [userId, targetCategoryId, event.amount, event.description || event.merchant, event.transaction_date]
  );
  if (claim.rows[0]?.import_id) {
    await client.query('UPDATE public.transaction_import_fingerprints SET record_id = $1 WHERE import_id = $2', [
      inserted.rows[0].transaction_id,
      claim.rows[0].import_id,
    ]);
  }
  return { duplicate: false, type, recordId: inserted.rows[0].transaction_id };
}

/* ==========================================================================
   FULLY AUTOMATED CSV-BASED IMPORT ENDPOINT (ONE-CLICK)
   ========================================================================== */

router.post('/csv/auto-import', authenticateToken, async (req, res, next) => {
  const userId = Number(req.user.user_id);
  const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
  const customMapping = req.body?.mapping || null;

  if (!csvText.trim()) {
    return res.status(400).json({ success: false, message: 'No CSV content provided.' });
  }
  if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_SIZE_BYTES) {
    return res.status(413).json({ success: false, message: 'CSV statement file exceeds 10MB limit.' });
  }

  try {
    // 1. Fetch user's categories from database
    const catResult = await query(
      `SELECT category_id, category_name, category_type FROM public.categories ORDER BY category_id ASC`
    );
    const dbCategories = catResult.rows;

    // 2. Fetch existing fingerprints for deduplication
    const existingFingerprints = new Set();
    try {
      const [claimedFp, eventFp] = await Promise.all([
        query('SELECT fingerprint FROM public.transaction_import_fingerprints WHERE user_id = $1', [userId]),
        query("SELECT fingerprint FROM public.autotrack_events WHERE user_id = $1 AND status != 'rejected'", [userId]),
      ]);
      claimedFp.rows.forEach(r => existingFingerprints.add(r.fingerprint));
      eventFp.rows.forEach(r => existingFingerprints.add(r.fingerprint));
    } catch (e) {}

    // 3. Parse and normalize statement
    const parsedStatement = parseAndNormalizeStatement(csvText, {
      userId,
      categories: dbCategories,
      existingFingerprints,
      customMapping,
    });

    // If format is completely unrecognized and no custom mapping was provided, prompt user for mapping
    if (!parsedStatement.isRecognized && !customMapping) {
      return res.json({
        success: true,
        isRecognized: false,
        formatName: parsedStatement.formatName,
        headers: parsedStatement.headers,
        suggestedMapping: parsedStatement.mapping,
        totalRawRows: parsedStatement.totalRows,
        message: 'Unsupported or custom CSV format detected. Please confirm column mapping.',
      });
    }

    // 4. Batch Import Eligible Transactions in a single atomic DB transaction
    const client = await pool.connect();
    const webDeviceId = await getOrCreateWebDevice(client, userId);

    let importedExpensesCount = 0;
    let importedIncomeCount = 0;
    let totalExpenseAmount = 0;
    let totalIncomeAmount = 0;
    const categoryCounts = {};

    try {
      await client.query('BEGIN');

      // Process successful non-duplicate rows
      for (const item of parsedStatement.successfulRows) {
        const isDebit = item.direction === 'debit';
        const type = isDebit ? 'expense' : 'income';

        // Safe category assignment
        let catId = item.categoryId;
        if (!catId) {
          const fallback = await findFallbackCategory(client, type);
          catId = fallback?.category_id;
        }

        // Insert into core financial tables
        let insertedRecordId = null;
        if (isDebit) {
          const insRes = await client.query(
            `INSERT INTO public.expenses (user_id, category_id, amount, expense_date, description)
             VALUES ($1, $2, $3, $4, $5) RETURNING expense_id`,
            [userId, catId, item.amount, item.transactionDate, item.description]
          );
          insertedRecordId = insRes.rows[0].expense_id;
          importedExpensesCount++;
          totalExpenseAmount += item.amount;
        } else {
          const insRes = await client.query(
            `INSERT INTO public.transactions (user_id, category_id, amount, type, description, transaction_date)
             VALUES ($1, $2, $3, 'income', $4, $5) RETURNING transaction_id`,
            [userId, catId, item.amount, item.description, item.transactionDate]
          );
          insertedRecordId = insRes.rows[0].transaction_id;
          importedIncomeCount++;
          totalIncomeAmount += item.amount;
        }

        // Track category stats
        categoryCounts[item.categoryName] = (categoryCounts[item.categoryName] || 0) + 1;

        // Record fingerprint claim
        try {
          await client.query(
            `INSERT INTO public.transaction_import_fingerprints (user_id, fingerprint, source, transaction_type, record_id)
             VALUES ($1, $2, 'csv', $3, $4)
             ON CONFLICT (user_id, fingerprint) DO NOTHING`,
            [userId, item.fingerprint, type, insertedRecordId]
          );
        } catch (e) {}

        // Record in autotrack_events ledger
        try {
          await client.query(
            `INSERT INTO public.autotrack_events
              (user_id, device_id, source_app, fingerprint, amount, currency, direction, transaction_date, merchant, reference, status, imported_into, record_id, review_note)
             VALUES ($1, $2, 'csv_statement', $3, $4, 'INR', $5, $6, $7, $8, 'approved', $9, $10, $11)
             ON CONFLICT (user_id, fingerprint) DO NOTHING`,
            [
              userId,
              webDeviceId,
              item.fingerprint,
              item.amount,
              item.direction,
              item.transactionDate,
              item.merchant,
              item.reference,
              type,
              insertedRecordId,
              `Imported automatically from ${parsedStatement.formatName}`
            ]
          );
        } catch (e) {}
      }

      // Record duplicate rows in autotrack ledger for visibility
      for (const dup of parsedStatement.duplicateRows) {
        try {
          await client.query(
            `INSERT INTO public.autotrack_events
              (user_id, device_id, source_app, fingerprint, amount, currency, direction, transaction_date, merchant, reference, status, review_note)
             VALUES ($1, $2, 'csv_statement', $3, $4, 'INR', $5, $6, $7, $8, 'duplicate', 'Duplicate skipped: already present in records.')
             ON CONFLICT (user_id, fingerprint) DO NOTHING`,
            [userId, webDeviceId, dup.fingerprint, dup.amount, dup.direction, dup.transactionDate, dup.merchant, dup.reference]
          );
        } catch (e) {}
      }

      // Record skipped failed status rows (e.g. status was FAILURE)
      for (const failedItem of parsedStatement.skippedFailedRows) {
        try {
          const fakeFp = sha256(`failed|${userId}|${rowNumber}|${Date.now()}|${Math.random()}`);
          await client.query(
            `INSERT INTO public.autotrack_events
              (user_id, device_id, source_app, fingerprint, amount, currency, direction, transaction_date, merchant, reference, status, review_note)
             VALUES ($1, $2, 'csv_statement', $3, 0, 'INR', 'debit', CURRENT_DATE, 'Failed Transaction', null, 'rejected', $4)
             ON CONFLICT DO NOTHING`,
            [userId, webDeviceId, fakeFp, failedItem.reason]
          );
        } catch (e) {}
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      isRecognized: true,
      formatDetected: parsedStatement.formatName,
      totalRows: parsedStatement.totalRows,
      importedCount: parsedStatement.successfulRows.length,
      duplicateCount: parsedStatement.duplicateRows.length,
      failedCount: parsedStatement.skippedFailedRows.length,
      invalidCount: parsedStatement.invalidRows.length,
      importedExpensesCount,
      importedIncomeCount,
      totalExpenseAmount: parseFloat(totalExpenseAmount.toFixed(2)),
      totalIncomeAmount: parseFloat(totalIncomeAmount.toFixed(2)),
      categoryBreakdown: categoryCounts,
      sampleImported: parsedStatement.successfulRows.slice(0, 5),
      message: `Successfully processed statement! Imported ${parsedStatement.successfulRows.length} transactions (${parsedStatement.duplicateRows.length} duplicates and ${parsedStatement.skippedFailedRows.length} non-successful entries skipped).`,
    });
  } catch (error) {
    next(error);
  }
});

/* ==========================================================================
   LEGACY & MANUAL MAPPING ENDPOINTS (RETAINED FOR CUSTOM/EDGE CASES)
   ========================================================================== */

router.post('/csv/inspect', authenticateToken, async (req, res, next) => {
  try {
    const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
    if (!csvText.trim()) {
      return res.status(400).json({ success: false, message: 'No CSV content provided.' });
    }
    if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_SIZE_BYTES) {
      return res.status(413).json({ success: false, message: 'CSV statement file exceeds 10MB limit.' });
    }

    const delimiter = detectDelimiter(csvText);
    const rows = parseCSV(csvText, delimiter);
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Uploaded CSV file contains no readable data.' });
    }

    const headerIdx = findHeaderRowIndex(rows);
    const headers = rows[headerIdx] || [];
    const formatInfo = detectStatementFormat(headers);
    const sampleRows = rows.slice(headerIdx + 1, headerIdx + 6);

    res.json({
      success: true,
      delimiter,
      headerRowIndex: headerIdx,
      headers,
      formatDetected: formatInfo.formatName,
      isRecognized: formatInfo.isRecognized,
      suggestedMapping: formatInfo.mapping,
      sampleRows,
      totalRawRows: rows.length,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/csv/preview', authenticateToken, async (req, res, next) => {
  try {
    const userId = Number(req.user.user_id);
    const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
    const customMapping = req.body?.mapping || {};

    if (!csvText.trim()) {
      return res.status(400).json({ success: false, message: 'No CSV content provided.' });
    }

    const catResult = await query(`SELECT category_id, category_name, category_type FROM public.categories`);
    const dbCategories = catResult.rows;

    const existingFingerprints = new Set();
    try {
      const [claimedFp, eventFp] = await Promise.all([
        query('SELECT fingerprint FROM public.transaction_import_fingerprints WHERE user_id = $1', [userId]),
        query("SELECT fingerprint FROM public.autotrack_events WHERE user_id = $1 AND status != 'rejected'", [userId]),
      ]);
      claimedFp.rows.forEach(r => existingFingerprints.add(r.fingerprint));
      eventFp.rows.forEach(r => existingFingerprints.add(r.fingerprint));
    } catch (err) {}

    const parseResult = parseAndNormalizeStatement(csvText, {
      userId,
      categories: dbCategories,
      existingFingerprints,
      customMapping,
    });

    res.json({
      success: true,
      headers: parseResult.headers,
      mapping: parseResult.mapping,
      formatName: parseResult.formatName,
      isRecognized: parseResult.isRecognized,
      totalRowsProcessed: parseResult.totalRows,
      validCount: parseResult.successfulRows.length,
      duplicateCount: parseResult.duplicateRows.length,
      failedCount: parseResult.skippedFailedRows.length,
      invalidCount: parseResult.invalidRows.length,
      validRows: parseResult.successfulRows,
      duplicateRows: parseResult.duplicateRows,
      failedRows: parseResult.skippedFailedRows,
      invalidRows: parseResult.invalidRows,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/csv/import', authenticateToken, async (req, res, next) => {
  const userId = Number(req.user.user_id);
  const transactions = req.body?.transactions;
  const importMode = req.body?.importMode === 'direct' ? 'direct' : 'review_queue';
  const defaultExpenseCategoryId = req.body?.defaultExpenseCategoryId ? Number(req.body.defaultExpenseCategoryId) : null;
  const defaultIncomeCategoryId = req.body?.defaultIncomeCategoryId ? Number(req.body.defaultIncomeCategoryId) : null;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ success: false, message: 'No transactions to import.' });
  }

  const client = await pool.connect();
  const summary = { total: transactions.length, queued: 0, imported: 0, duplicates: 0, failed: 0 };

  try {
    await client.query('BEGIN');
    const webDeviceId = await getOrCreateWebDevice(client, userId);

    for (const item of transactions) {
      if (!item.amount || !item.transactionDate || !item.direction) {
        summary.failed++;
        continue;
      }

      const fingerprint = item.fingerprint || sha256(`${userId}|${item.transactionDate}|${Number(item.amount).toFixed(2)}|${item.direction}|${item.reference || item.merchant?.toLowerCase()}`);

      let isDuplicate = false;
      try {
        const check = await client.query(
          `SELECT import_id FROM public.transaction_import_fingerprints WHERE user_id = $1 AND fingerprint = $2`,
          [userId, fingerprint]
        );
        if (check.rowCount > 0) isDuplicate = true;
      } catch (e) {}

      if (isDuplicate) {
        summary.duplicates++;
        continue;
      }

      if (importMode === 'direct') {
        const categoryId = item.categoryId || (item.direction === 'debit' ? defaultExpenseCategoryId : defaultIncomeCategoryId);
        const result = await importEvent(
          client,
          {
            direction: item.direction,
            amount: Number(item.amount),
            transaction_date: item.transactionDate,
            merchant: item.merchant,
            description: item.description,
            fingerprint,
          },
          userId,
          categoryId,
          'csv'
        );

        if (result.duplicate) {
          summary.duplicates++;
        } else {
          summary.imported++;
          try {
            await client.query(
              `INSERT INTO public.autotrack_events
                (user_id, device_id, source_app, fingerprint, amount, currency, direction, transaction_date, merchant, reference, status, imported_into, record_id, review_note)
               VALUES ($1, $2, 'csv_statement', $3, $4, 'INR', $5, $6, $7, $8, 'approved', $9, $10, 'Imported from CSV statement.')
               ON CONFLICT (user_id, fingerprint) DO UPDATE
                 SET status = 'approved', imported_into = EXCLUDED.imported_into, record_id = EXCLUDED.record_id`,
              [userId, webDeviceId, fingerprint, item.amount, item.direction, item.transactionDate, item.merchant, item.reference, result.type, result.recordId]
            );
          } catch (e) {}
        }
      } else {
        const inserted = await client.query(
          `INSERT INTO public.autotrack_events
            (user_id, device_id, source_app, fingerprint, amount, currency, direction, transaction_date, merchant, reference, status)
           VALUES ($1, $2, 'csv_statement', $3, $4, 'INR', $5, $6, $7, $8, 'pending')
           ON CONFLICT (user_id, fingerprint) DO NOTHING
           RETURNING event_id`,
          [userId, webDeviceId, fingerprint, item.amount, item.direction, item.transactionDate, item.merchant, item.reference]
        );

        if (inserted.rowCount > 0) summary.queued++;
        else summary.duplicates++;
      }
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      importMode,
      ...summary,
      message: importMode === 'direct'
        ? `Imported ${summary.imported} transactions into records (${summary.duplicates} duplicates skipped).`
        : `Added ${summary.queued} transactions to AutoTrack review queue (${summary.duplicates} duplicates skipped).`,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

/* ==========================================================================
   SUMMARY & TRANSACTION HISTORY ENDPOINTS
   ========================================================================== */

router.get('/summary', authenticateToken, async (req, res, next) => {
  try {
    const userId = Number(req.user.user_id);
    const [countsRes, approvedAmountRes, recentRes] = await Promise.all([
      query(
        `SELECT status, COUNT(*) AS count
           FROM public.autotrack_events
          WHERE user_id = $1
          GROUP BY status`,
        [userId]
      ),
      query(
        `SELECT COALESCE(SUM(amount), 0) AS total_approved
           FROM public.autotrack_events
          WHERE user_id = $1 AND status = 'approved'`,
        [userId]
      ),
      query(
        `SELECT event_id, source_app, amount, currency, direction, transaction_date, merchant, reference, status, created_at
           FROM public.autotrack_events
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 10`,
        [userId]
      ),
    ]);

    const counts = { pending: 0, approved: 0, rejected: 0, duplicate: 0 };
    countsRes.rows.forEach((r) => {
      if (counts[r.status] !== undefined) counts[r.status] = parseInt(r.count, 10);
    });

    res.json({
      success: true,
      summary: {
        pendingCount: counts.pending,
        approvedCount: counts.approved,
        rejectedCount: counts.rejected,
        duplicateCount: counts.duplicate,
        totalImportedAmount: parseFloat(approvedAmountRes.rows[0]?.total_approved || 0),
        recentTransactions: recentRes.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/events', authenticateToken, async (req, res, next) => {
  try {
    const validStatuses = ['pending', 'approved', 'rejected', 'duplicate'];
    const statusParam = req.query.status;
    const filterByStatus = validStatuses.includes(statusParam);

    let queryText = `
      SELECT event_id, source_app, amount, currency, direction, transaction_date, merchant, reference, status, review_note, created_at
        FROM public.autotrack_events
       WHERE user_id = $1
    `;
    const params = [req.user.user_id];

    if (filterByStatus) {
      params.push(statusParam);
      queryText += ` AND status = $2`;
    }

    queryText += ` ORDER BY transaction_date DESC, created_at DESC LIMIT 300`;

    const result = await query(queryText, params);
    res.json({ success: true, events: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:eventId/approve', authenticateToken, async (req, res, next) => {
  if (!/^\d+$/.test(req.params.eventId)) return res.status(400).json({ success: false, message: 'Invalid event.' });
  const categoryId = req.body?.categoryId == null || req.body.categoryId === '' ? null : Number(req.body.categoryId);
  if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId < 1)) {
    return res.status(400).json({ success: false, message: 'Invalid category.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT * FROM public.autotrack_events WHERE event_id = $1 AND user_id = $2 FOR UPDATE`,
      [req.params.eventId, req.user.user_id]
    );
    if (found.rowCount === 0 || found.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Pending transaction not found.' });
    }
    const event = found.rows[0];
    const imported = await importEvent(
      client,
      {
        direction: event.direction,
        amount: Number(event.amount),
        transaction_date: event.transaction_date instanceof Date
          ? event.transaction_date.toISOString().slice(0, 10)
          : String(event.transaction_date).slice(0, 10),
        merchant: event.merchant,
        fingerprint: event.fingerprint,
      },
      Number(req.user.user_id),
      categoryId,
      'csv'
    );

    if (imported.duplicate) {
      await client.query(
        `UPDATE public.autotrack_events SET status='duplicate', review_note='This transaction already exists in Finlytics.' WHERE event_id=$1`,
        [event.event_id]
      );
      await client.query('COMMIT');
      return res.json({ success: true, duplicate: true, message: 'Duplicate detected.' });
    }

    await client.query(
      `UPDATE public.autotrack_events SET status='approved', imported_into=$1, record_id=$2, review_note=NULL WHERE event_id=$3`,
      [imported.type, imported.recordId, event.event_id]
    );
    await client.query('COMMIT');
    res.json({ success: true, duplicate: false, importedInto: imported.type });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.message?.startsWith('Choose a valid') || error.message?.startsWith('No ')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  } finally {
    client.release();
  }
});

router.post('/events/:eventId/reject', authenticateToken, async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.eventId)) return res.status(400).json({ success: false, message: 'Invalid event.' });
    const result = await query(
      `UPDATE public.autotrack_events SET status='rejected', review_note='Dismissed by user.'
        WHERE event_id=$1 AND user_id=$2 AND status='pending' RETURNING event_id`,
      [req.params.eventId, req.user.user_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Pending transaction not found.' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/events/bulk-approve', authenticateToken, async (req, res, next) => {
  const userId = Number(req.user.user_id);
  const eventIds = req.body?.eventIds;
  const allPending = Boolean(req.body?.allPending);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let eventsToApprove = [];

    if (allPending) {
      const pendingRes = await client.query(
        `SELECT * FROM public.autotrack_events WHERE user_id = $1 AND status = 'pending' FOR UPDATE`,
        [userId]
      );
      eventsToApprove = pendingRes.rows;
    } else if (Array.isArray(eventIds) && eventIds.length > 0) {
      const sanitizedIds = eventIds.map(Number).filter(n => Number.isInteger(n) && n > 0);
      const pendingRes = await client.query(
        `SELECT * FROM public.autotrack_events WHERE user_id = $1 AND event_id = ANY($2::bigint[]) AND status = 'pending' FOR UPDATE`,
        [userId, sanitizedIds]
      );
      eventsToApprove = pendingRes.rows;
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No event IDs provided.' });
    }

    let approvedCount = 0;
    let duplicateCount = 0;

    for (const event of eventsToApprove) {
      const imported = await importEvent(
        client,
        {
          direction: event.direction,
          amount: Number(event.amount),
          transaction_date: event.transaction_date instanceof Date
            ? event.transaction_date.toISOString().slice(0, 10)
            : String(event.transaction_date).slice(0, 10),
          merchant: event.merchant,
          fingerprint: event.fingerprint,
        },
        userId,
        null,
        'csv'
      );

      if (imported.duplicate) {
        duplicateCount++;
        await client.query(
          `UPDATE public.autotrack_events SET status='duplicate', review_note='Duplicate of existing record.' WHERE event_id=$1`,
          [event.event_id]
        );
      } else {
        approvedCount++;
        await client.query(
          `UPDATE public.autotrack_events SET status='approved', imported_into=$1, record_id=$2, review_note=NULL WHERE event_id=$3`,
          [imported.type, imported.recordId, event.event_id]
        );
      }
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      approvedCount,
      duplicateCount,
      message: `Approved ${approvedCount} transactions (${duplicateCount} marked duplicate).`,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

router.post('/events/bulk-reject', authenticateToken, async (req, res, next) => {
  const userId = Number(req.user.user_id);
  const eventIds = req.body?.eventIds;
  const allPending = Boolean(req.body?.allPending);

  try {
    let result;
    if (allPending) {
      result = await query(
        `UPDATE public.autotrack_events SET status = 'rejected', review_note = 'Bulk dismissed by user.'
          WHERE user_id = $1 AND status = 'pending'`,
        [userId]
      );
    } else if (Array.isArray(eventIds) && eventIds.length > 0) {
      const sanitizedIds = eventIds.map(Number).filter(n => Number.isInteger(n) && n > 0);
      result = await query(
        `UPDATE public.autotrack_events SET status = 'rejected', review_note = 'Bulk dismissed by user.'
          WHERE user_id = $1 AND event_id = ANY($2::bigint[]) AND status = 'pending'`,
        [userId, sanitizedIds]
      );
    } else {
      return res.status(400).json({ success: false, message: 'No event IDs provided.' });
    }

    res.json({
      success: true,
      rejectedCount: result.rowCount,
      message: `Dismissed ${result.rowCount} transactions.`,
    });
  } catch (error) {
    next(error);
  }
});

/* ==========================================================================
   SETTINGS & DEVICE COMPATIBILITY (RETAINED)
   ========================================================================== */

router.get('/settings', authenticateToken, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT auto_import_enabled, require_reference
         FROM public.autotrack_settings WHERE user_id = $1`,
      [req.user.user_id]
    );
    res.json({ success: true, settings: result.rows[0] || { auto_import_enabled: false, require_reference: true } });
  } catch (error) {
    next(error);
  }
});

router.put('/settings', authenticateToken, async (req, res, next) => {
  try {
    if (typeof req.body?.autoImportEnabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'autoImportEnabled must be true or false.' });
    }
    const requireReference = req.body?.requireReference === undefined ? true : req.body.requireReference;
    if (typeof requireReference !== 'boolean') {
      return res.status(400).json({ success: false, message: 'requireReference must be true or false.' });
    }

    const result = await query(
      `INSERT INTO public.autotrack_settings (user_id, auto_import_enabled, require_reference, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET auto_import_enabled = EXCLUDED.auto_import_enabled,
             require_reference = EXCLUDED.require_reference,
             updated_at = NOW()
       RETURNING auto_import_enabled, require_reference`,
      [req.user.user_id, req.body.autoImportEnabled, requireReference]
    );
    res.json({ success: true, settings: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/devices', authenticateToken, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT device_id, device_name, created_at, last_seen_at
         FROM public.autotrack_devices
        WHERE user_id = $1 AND revoked_at IS NULL AND device_name != 'Web Statement Importer'
        ORDER BY created_at DESC`,
      [req.user.user_id]
    );
    res.json({ success: true, devices: result.rows });
  } catch (error) {
    next(error);
  }
});

router.delete('/devices/:deviceId', authenticateToken, async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.deviceId)) return res.status(400).json({ success: false, message: 'Invalid device.' });
    const result = await query(
      `UPDATE public.autotrack_devices SET revoked_at = NOW()
        WHERE device_id = $1 AND user_id = $2 AND revoked_at IS NULL
        RETURNING device_id`,
      [req.params.deviceId, req.user.user_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Device not found.' });
    res.json({ success: true, message: 'Device disconnected.' });
  } catch (error) {
    next(error);
  }
});

export default router;
