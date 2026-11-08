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
  parseStatementRows,
} from '../utils/csvParser.js';

const router = express.Router();
const MAX_EVENTS_PER_BATCH = 25;
const MAX_CSV_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Parse json body up to 5MB for CSV statements
router.use(express.json({ limit: '5mb' }));

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
    // If table doesn't require device or has issues, return null
    return null;
  }
}

/**
 * Helper to find fallback category for expense or income
 */
async function findFallbackCategory(client, type) {
  const preferred = type === 'expense' ? 'other expense' : 'other income';
  const result = await client.query(
    `SELECT category_id FROM public.categories
      WHERE category_type = $1
      ORDER BY CASE WHEN LOWER(category_name) = $2 THEN 0 ELSE 1 END, category_id
      LIMIT 1`,
    [type, preferred]
  );
  return result.rows[0]?.category_id ?? null;
}

/**
 * Imports an event into core Finlytics transaction tables (expenses or transactions),
 * validating category matching, checking fingerprint uniqueness, and updating import ledger.
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
    targetCategoryId = await findFallbackCategory(client, type);
  }
  if (!targetCategoryId) throw new Error(`No ${type} category is configured.`);

  const fingerprint = event.fingerprint;

  // Insert fingerprint into ledger
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
    // Fallback if table doesn't exist yet
    claim = { rowCount: 1, rows: [{ import_id: null }] };
  }

  if (claim.rowCount === 0) return { duplicate: true };

  let inserted;
  if (type === 'expense') {
    inserted = await client.query(
      `INSERT INTO public.expenses (user_id, category_id, amount, expense_date, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING expense_id`,
      [userId, targetCategoryId, event.amount, event.transaction_date, event.merchant]
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
    [userId, targetCategoryId, event.amount, event.merchant, event.transaction_date]
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
   WEB CSV BANK STATEMENT ENDPOINTS
   ========================================================================== */

/**
 * Inspect uploaded CSV statement text:
 * Detects delimiter, finds header row, and suggests column mapping.
 */
router.post('/csv/inspect', authenticateToken, async (req, res, next) => {
  try {
    const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
    if (!csvText.trim()) {
      return res.status(400).json({ success: false, message: 'No CSV content provided.' });
    }
    if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_SIZE_BYTES) {
      return res.status(413).json({ success: false, message: 'CSV statement file exceeds 5MB limit.' });
    }

    const delimiter = detectDelimiter(csvText);
    const rows = parseCSV(csvText, delimiter);
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Uploaded CSV file contains no readable data.' });
    }

    const headerIdx = findHeaderRowIndex(rows);
    const headers = rows[headerIdx] || [];
    const suggestedMapping = guessColumnMapping(headers);

    // Provide up to 5 sample data rows for user preview
    const sampleRows = rows.slice(headerIdx + 1, headerIdx + 6);

    res.json({
      success: true,
      delimiter,
      headerRowIndex: headerIdx,
      headers,
      suggestedMapping,
      sampleRows,
      totalRawRows: rows.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Preview and validate parsed statement transactions with duplicate checking
 */
router.post('/csv/preview', authenticateToken, async (req, res, next) => {
  try {
    const userId = Number(req.user.user_id);
    const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
    const customMapping = req.body?.mapping || {};

    if (!csvText.trim()) {
      return res.status(400).json({ success: false, message: 'No CSV content provided.' });
    }
    if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_SIZE_BYTES) {
      return res.status(413).json({ success: false, message: 'CSV file is too large (max 5MB).' });
    }

    const delimiter = detectDelimiter(csvText);
    const rows = parseCSV(csvText, delimiter);
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'CSV has no data.' });
    }

    // Collect all existing fingerprints for user from both tables
    const existingFingerprints = new Set();
    try {
      const [claimedFp, eventFp] = await Promise.all([
        query('SELECT fingerprint FROM public.transaction_import_fingerprints WHERE user_id = $1', [userId]),
        query("SELECT fingerprint FROM public.autotrack_events WHERE user_id = $1 AND status != 'rejected'", [userId]),
      ]);
      claimedFp.rows.forEach(r => existingFingerprints.add(r.fingerprint));
      eventFp.rows.forEach(r => existingFingerprints.add(r.fingerprint));
    } catch (err) {
      // Table might be fresh
    }

    const parseResult = parseStatementRows(rows, customMapping, {
      userId,
      existingFingerprints,
    });

    const duplicateCount = parseResult.validRows.filter(r => r.isDuplicate).length;
    const newCount = parseResult.validRows.filter(r => !r.isDuplicate).length;

    res.json({
      success: true,
      headers: parseResult.headers,
      mapping: parseResult.mapping,
      totalRowsProcessed: rows.length,
      validCount: parseResult.validRows.length,
      newCount,
      duplicateCount,
      invalidCount: parseResult.invalidRows.length,
      validRows: parseResult.validRows,
      invalidRows: parseResult.invalidRows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Import statement transactions:
 * Supports importing directly into expenses/income or placing into AutoTrack Review Queue.
 */
router.post('/csv/import', authenticateToken, async (req, res, next) => {
  const userId = Number(req.user.user_id);
  const transactions = req.body?.transactions;
  const importMode = req.body?.importMode === 'direct' ? 'direct' : 'review_queue';
  const defaultExpenseCategoryId = req.body?.defaultExpenseCategoryId ? Number(req.body.defaultExpenseCategoryId) : null;
  const defaultIncomeCategoryId = req.body?.defaultIncomeCategoryId ? Number(req.body.defaultIncomeCategoryId) : null;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ success: false, message: 'No transactions to import.' });
  }
  if (transactions.length > 1000) {
    return res.status(400).json({ success: false, message: 'Maximum 1,000 transactions per batch.' });
  }

  const client = await pool.connect();
  const summary = {
    total: transactions.length,
    queued: 0,
    imported: 0,
    duplicates: 0,
    failed: 0,
  };

  try {
    await client.query('BEGIN');
    const webDeviceId = await getOrCreateWebDevice(client, userId);

    for (const item of transactions) {
      if (!item.amount || !item.transactionDate || !item.direction) {
        summary.failed++;
        continue;
      }

      const fingerprint = item.fingerprint || sha256(`${userId}|${item.transactionDate}|${Number(item.amount).toFixed(2)}|${item.direction}|${item.reference || item.merchant?.toLowerCase()}`);

      // Check if already exists in fingerprints
      let isDuplicate = false;
      try {
        const check = await client.query(
          `SELECT import_id FROM public.transaction_import_fingerprints WHERE user_id = $1 AND fingerprint = $2`,
          [userId, fingerprint]
        );
        if (check.rowCount > 0) isDuplicate = true;
      } catch (e) {}

      if (!isDuplicate) {
        const checkEvent = await client.query(
          `SELECT event_id, status FROM public.autotrack_events WHERE user_id = $1 AND fingerprint = $2`,
          [userId, fingerprint]
        );
        if (checkEvent.rowCount > 0 && checkEvent.rows[0].status !== 'rejected') {
          isDuplicate = true;
        }
      }

      if (isDuplicate) {
        summary.duplicates++;
        // Record in events ledger as duplicate if not already present
        try {
          await client.query(
            `INSERT INTO public.autotrack_events
              (user_id, device_id, source_app, fingerprint, amount, currency, direction, transaction_date, merchant, reference, status, review_note)
             VALUES ($1, $2, 'csv_statement', $3, $4, 'INR', $5, $6, $7, $8, 'duplicate', 'Already exists in your transaction records.')
             ON CONFLICT (user_id, fingerprint) DO NOTHING`,
            [userId, webDeviceId, fingerprint, item.amount, item.direction, item.transactionDate, item.merchant || 'Bank Transaction', item.reference || null]
          );
        } catch (err) {}
        continue;
      }

      // If Direct Mode: immediately insert into expenses or transactions
      if (importMode === 'direct') {
        const categoryId = item.direction === 'debit' ? defaultExpenseCategoryId : defaultIncomeCategoryId;
        const result = await importEvent(
          client,
          {
            direction: item.direction,
            amount: Number(item.amount),
            transaction_date: item.transactionDate,
            merchant: item.merchant || 'Bank Transaction',
            fingerprint,
          },
          userId,
          categoryId,
          'csv'
        );

        if (result.duplicate) {
          summary.duplicates++;
        } else {
          // Record approved event in autotrack_events for tracking and audit
          await client.query(
            `INSERT INTO public.autotrack_events
              (user_id, device_id, source_app, fingerprint, amount, currency, direction, transaction_date, merchant, reference, status, imported_into, record_id, review_note)
             VALUES ($1, $2, 'csv_statement', $3, $4, 'INR', $5, $6, $7, $8, 'approved', $9, $10, 'Imported directly from bank statement CSV.')
             ON CONFLICT (user_id, fingerprint) DO UPDATE
               SET status = 'approved', imported_into = EXCLUDED.imported_into, record_id = EXCLUDED.record_id, review_note = EXCLUDED.review_note`,
            [userId, webDeviceId, fingerprint, item.amount, item.direction, item.transactionDate, item.merchant || 'Bank Transaction', item.reference || null, result.type, result.recordId]
          );
          summary.imported++;
        }
      } else {
        // Review Queue Mode: insert as pending into autotrack_events
        const inserted = await client.query(
          `INSERT INTO public.autotrack_events
            (user_id, device_id, source_app, fingerprint, amount, currency, direction, transaction_date, merchant, reference, status)
           VALUES ($1, $2, 'csv_statement', $3, $4, 'INR', $5, $6, $7, $8, 'pending')
           ON CONFLICT (user_id, fingerprint) DO NOTHING
           RETURNING event_id`,
          [userId, webDeviceId, fingerprint, item.amount, item.direction, item.transactionDate, item.merchant || 'Bank Transaction', item.reference || null]
        );

        if (inserted.rowCount > 0) {
          summary.queued++;
        } else {
          summary.duplicates++;
        }
      }
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      importMode,
      ...summary,
      message: importMode === 'direct'
        ? `Successfully imported ${summary.imported} transactions into your records (${summary.duplicates} duplicates skipped).`
        : `Added ${summary.queued} transactions to your AutoTrack review queue (${summary.duplicates} duplicates skipped).`,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

/* ==========================================================================
   AUTOTRACK SUMMARY & OVERVIEW
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
          LIMIT 5`,
        [userId]
      ),
    ]);

    const counts = { pending: 0, approved: 0, rejected: 0, duplicate: 0 };
    countsRes.rows.forEach((r) => {
      if (counts[r.status] !== undefined) {
        counts[r.status] = parseInt(r.count, 10);
      }
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

/* ==========================================================================
   REVIEW QUEUE & SINGLE / BULK ACTIONS
   ========================================================================== */

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

    queryText += ` ORDER BY transaction_date DESC, created_at DESC LIMIT 200`;

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
      event.source_app?.includes('csv') ? 'csv' : 'android_notification'
    );

    if (imported.duplicate) {
      await client.query(
        `UPDATE public.autotrack_events SET status='duplicate', review_note='This transaction already exists in Finlytics.' WHERE event_id=$1`,
        [event.event_id]
      );
      await client.query('COMMIT');
      return res.json({ success: true, duplicate: true, message: 'Marked as duplicate; already exists in records.' });
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

/**
 * Bulk approve pending events
 */
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
        null, // Uses default fallback category
        event.source_app?.includes('csv') ? 'csv' : 'android_notification'
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
      message: `Approved ${approvedCount} transactions into records (${duplicateCount} marked duplicate).`,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

/**
 * Bulk reject pending events
 */
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
   AUTOTRACK SETTINGS
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

/* ==========================================================================
   FUTURE COMPATIBILITY: PAIRING & COMPANION DEVICE MANAGEMENT
   (Isolated and kept for future companion phases)
   ========================================================================== */

router.post('/pairing-codes', authenticateToken, async (req, res, next) => {
  try {
    const userId = Number(req.user?.user_id);
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(401).json({ success: false, message: 'Sign in again to pair a device.' });
    }

    await query(`DELETE FROM public.autotrack_pairing_codes WHERE user_id = $1`, [userId]);
    const code = crypto.randomBytes(18).toString('base64url');
    await query(
      `INSERT INTO public.autotrack_pairing_codes (user_id, code_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [userId, sha256(code)]
    );

    res.status(201).json({ success: true, pairingCode: code, expiresInSeconds: 600 });
  } catch (error) {
    next(error);
  }
});

router.post('/pair', async (req, res, next) => {
  const code = typeof req.body?.pairingCode === 'string' ? req.body.pairingCode.trim() : '';
  const deviceName = cleanText(req.body?.deviceName, 80, 'Android device');
  if (code.length < 20 || code.length > 40) {
    return res.status(400).json({ success: false, message: 'Invalid or expired pairing code.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pairing = await client.query(
      `SELECT pairing_id, user_id
         FROM public.autotrack_pairing_codes
        WHERE code_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        FOR UPDATE`,
      [sha256(code)]
    );
    if (pairing.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid or expired pairing code. Generate a new code in Finlytics.' });
    }

    const deviceId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    const userId = pairing.rows[0].user_id;

    await client.query(
      `INSERT INTO public.autotrack_devices (device_id, user_id, device_name, token_hash)
       VALUES ($1, $2, $3, $4)`,
      [deviceId, userId, deviceName, tokenHash]
    );
    await client.query(
      `UPDATE public.autotrack_pairing_codes SET used_at = NOW() WHERE pairing_id = $1`,
      [pairing.rows[0].pairing_id]
    );
    await client.query('COMMIT');

    res.status(201).json({ success: true, deviceId, deviceToken: token, deviceName });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

router.get('/devices', authenticateToken, async (req, res, next) => {
  try {
    // Exclude internal Web Statement Importer device from mobile companion device list
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

router.post('/events', authenticateAutoTrackDevice, async (req, res, next) => {
  const inputs = req.body?.events;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return res.status(400).json({ success: false, message: 'No notification events were supplied.' });
  }
  if (inputs.length > MAX_EVENTS_PER_BATCH) {
    return res.status(413).json({ success: false, message: `Maximum ${MAX_EVENTS_PER_BATCH} events per request.` });
  }
  if (Buffer.byteLength(JSON.stringify(inputs), 'utf8') > 32 * 1024) {
    return res.status(413).json({ success: false, message: 'Notification event payload is too large.' });
  }

  let events;
  try {
    events = inputs.map((item) => normalizeNotificationEvent(item));
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  const userId = Number(req.autoTrackDevice.user_id);
  const client = await pool.connect();
  const resultCounts = { received: events.length, queued: 0, autoImported: 0, duplicates: 0 };
  try {
    await client.query('BEGIN');
    await client.query('UPDATE public.autotrack_devices SET last_seen_at = NOW() WHERE device_id = $1', [req.autoTrackDevice.device_id]);
    const settingsResult = await client.query(
      `SELECT auto_import_enabled, require_reference FROM public.autotrack_settings WHERE user_id = $1`,
      [userId]
    );
    const settings = settingsResult.rows[0] || { auto_import_enabled: false, require_reference: true };

    for (const item of events) {
      const fingerprint = fingerprintForUser(userId, item);
      const priorImport = await client.query(
        `SELECT import_id FROM public.transaction_import_fingerprints WHERE user_id = $1 AND fingerprint = $2`,
        [userId, fingerprint]
      );
      const autoEligible = settings.auto_import_enabled && (!settings.require_reference || Boolean(item.reference));
      const initialStatus = priorImport.rowCount > 0 ? 'duplicate' : 'pending';
      const insertedEvent = await client.query(
        `INSERT INTO public.autotrack_events
          (user_id, device_id, source_app, fingerprint, amount, currency, direction, transaction_date, merchant, reference, status, review_note)
         VALUES ($1,$2,$3,$4,$5,'INR',$6,$7,$8,$9,$10,$11)
         ON CONFLICT (user_id, fingerprint) DO NOTHING
         RETURNING event_id, status`,
        [userId, req.autoTrackDevice.device_id, item.sourceApp, fingerprint, item.amount, item.direction, item.date, item.merchant, item.reference, initialStatus, priorImport.rowCount > 0 ? 'Already present in the transaction ledger.' : null]
      );
      if (insertedEvent.rowCount === 0) {
        resultCounts.duplicates += 1;
        continue;
      }
      if (initialStatus === 'duplicate') {
        resultCounts.duplicates += 1;
        continue;
      }
      if (!autoEligible) {
        resultCounts.queued += 1;
        continue;
      }

      const pending = { ...item, transaction_date: item.date, fingerprint };
      const imported = await importEvent(client, pending, userId, null, 'android_notification');
      if (imported.duplicate) {
        await client.query(`UPDATE public.autotrack_events SET status='duplicate', review_note='Already imported through another source.' WHERE event_id=$1`, [insertedEvent.rows[0].event_id]);
        resultCounts.duplicates += 1;
      } else {
        await client.query(
          `UPDATE public.autotrack_events SET status='approved', imported_into=$1, record_id=$2, review_note='Automatically imported: UPI reference detected.' WHERE event_id=$3`,
          [imported.type, imported.recordId, insertedEvent.rows[0].event_id]
        );
        resultCounts.autoImported += 1;
      }
    }

    await client.query('COMMIT');
    res.status(202).json({ success: true, ...resultCounts });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

export default router;
