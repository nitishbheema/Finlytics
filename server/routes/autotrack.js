import crypto from 'node:crypto';
import express from 'express';
import { pool, query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { authenticateAutoTrackDevice } from '../middleware/deviceAuth.js';
import { cleanText, fingerprintForUser, normalizeNotificationEvent, sha256 } from '../utils/autotrack.js';

const router = express.Router();
const MAX_EVENTS_PER_BATCH = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.use(express.json({ limit: '64kb' }));

router.post('/pairing-codes', authenticateToken, async (req, res, next) => {
  try {
    const userId = Number(req.user?.user_id);
    if (!Number.isInteger(userId) || userId < 1) return res.status(401).json({ success: false, message: 'Sign in again to pair a device.' });

    // Remove expired/used codes for this user; code values are never stored in plaintext.
    await query(`DELETE FROM public.autotrack_pairing_codes WHERE user_id = $1`, [userId]);
    // 144-bit, single-use code. Only the SHA-256 hash is persisted.
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

    // This bearer token is shown once. The Android client must store it using Android Keystore.
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
    const result = await query(
      `SELECT device_id, device_name, created_at, last_seen_at
         FROM public.autotrack_devices
        WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY created_at DESC`,
      [req.user.user_id]
    );
    res.json({ success: true, devices: result.rows });
  } catch (error) { next(error); }
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
  } catch (error) { next(error); }
});

router.get('/settings', authenticateToken, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT auto_import_enabled, require_reference
         FROM public.autotrack_settings WHERE user_id = $1`,
      [req.user.user_id]
    );
    res.json({ success: true, settings: result.rows[0] || { auto_import_enabled: false, require_reference: true } });
  } catch (error) { next(error); }
});

router.put('/settings', authenticateToken, async (req, res, next) => {
  try {
    if (typeof req.body?.autoImportEnabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'autoImportEnabled must be true or false.' });
    }
    const requireReference = req.body?.requireReference === undefined ? true : req.body.requireReference;
    if (typeof requireReference !== 'boolean') return res.status(400).json({ success: false, message: 'requireReference must be true or false.' });
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
  } catch (error) { next(error); }
});

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

async function importEvent(client, event, userId, categoryId = null) {
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
  const claim = await client.query(
    `INSERT INTO public.transaction_import_fingerprints (user_id, fingerprint, source, transaction_type)
     VALUES ($1, $2, 'android_notification', $3)
     ON CONFLICT (user_id, fingerprint) DO NOTHING
     RETURNING import_id`,
    [userId, fingerprint, type]
  );
  if (claim.rowCount === 0) return { duplicate: true };

  let inserted;
  if (type === 'expense') {
    inserted = await client.query(
      `INSERT INTO public.expenses (user_id, category_id, amount, expense_date, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING expense_id`,
      [userId, targetCategoryId, event.amount, event.transaction_date, event.merchant]
    );
    await client.query('UPDATE public.transaction_import_fingerprints SET record_id = $1 WHERE import_id = $2', [inserted.rows[0].expense_id, claim.rows[0].import_id]);
    return { duplicate: false, type, recordId: inserted.rows[0].expense_id };
  }

  inserted = await client.query(
    `INSERT INTO public.transactions (user_id, category_id, amount, type, description, transaction_date)
     VALUES ($1, $2, $3, 'income', $4, $5) RETURNING transaction_id`,
    [userId, targetCategoryId, event.amount, event.merchant, event.transaction_date]
  );
  await client.query('UPDATE public.transaction_import_fingerprints SET record_id = $1 WHERE import_id = $2', [inserted.rows[0].transaction_id, claim.rows[0].import_id]);
  return { duplicate: false, type, recordId: inserted.rows[0].transaction_id };
}

router.post('/events', authenticateAutoTrackDevice, async (req, res, next) => {
  const inputs = req.body?.events;
  if (!Array.isArray(inputs) || inputs.length === 0) return res.status(400).json({ success: false, message: 'No notification events were supplied.' });
  if (inputs.length > MAX_EVENTS_PER_BATCH) return res.status(413).json({ success: false, message: `Maximum ${MAX_EVENTS_PER_BATCH} events per request.` });
  if (Buffer.byteLength(JSON.stringify(inputs), 'utf8') > 32 * 1024) return res.status(413).json({ success: false, message: 'Notification event payload is too large.' });

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
      if (insertedEvent.rowCount === 0) { resultCounts.duplicates += 1; continue; }

      if (initialStatus === 'duplicate') { resultCounts.duplicates += 1; continue; }
      if (!autoEligible) { resultCounts.queued += 1; continue; }

      const pending = { ...item, transaction_date: item.date, fingerprint };
      const imported = await importEvent(client, pending, userId);
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
  } finally { client.release(); }
});

router.get('/events', authenticateToken, async (req, res, next) => {
  try {
    const status = ['pending', 'approved', 'rejected', 'duplicate'].includes(req.query.status) ? req.query.status : 'pending';
    const result = await query(
      `SELECT event_id, source_app, amount, currency, direction, transaction_date, merchant, reference, status, review_note, created_at
         FROM public.autotrack_events WHERE user_id = $1 AND status = $2
        ORDER BY created_at DESC LIMIT 100`,
      [req.user.user_id, status]
    );
    res.json({ success: true, events: result.rows });
  } catch (error) { next(error); }
});

router.post('/events/:eventId/approve', authenticateToken, async (req, res, next) => {
  if (!/^\d+$/.test(req.params.eventId)) return res.status(400).json({ success: false, message: 'Invalid event.' });
  const categoryId = req.body?.categoryId == null || req.body.categoryId === '' ? null : Number(req.body.categoryId);
  if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId < 1)) return res.status(400).json({ success: false, message: 'Invalid category.' });
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
    const imported = await importEvent(client, {
      direction: event.direction,
      amount: Number(event.amount),
      transaction_date: event.transaction_date instanceof Date
        ? event.transaction_date.toISOString().slice(0, 10)
        : String(event.transaction_date).slice(0, 10),
      merchant: event.merchant,
      fingerprint: event.fingerprint,
    }, Number(req.user.user_id), categoryId);

    if (imported.duplicate) {
      await client.query(`UPDATE public.autotrack_events SET status='duplicate', review_note='This transaction already exists in Finlytics.' WHERE event_id=$1`, [event.event_id]);
      await client.query('COMMIT');
      return res.json({ success: true, duplicate: true });
    }

    await client.query(
      `UPDATE public.autotrack_events SET status='approved', imported_into=$1, record_id=$2, review_note=NULL WHERE event_id=$3`,
      [imported.type, imported.recordId, event.event_id]
    );
    await client.query('COMMIT');
    res.json({ success: true, duplicate: false, importedInto: imported.type });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.message?.startsWith('Choose a valid') || error.message?.startsWith('No ')) return res.status(400).json({ success: false, message: error.message });
    next(error);
  } finally { client.release(); }
});

router.post('/events/:eventId/reject', authenticateToken, async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.eventId)) return res.status(400).json({ success: false, message: 'Invalid event.' });
    const result = await query(
      `UPDATE public.autotrack_events SET status='rejected', review_note='Rejected by user.'
        WHERE event_id=$1 AND user_id=$2 AND status='pending' RETURNING event_id`,
      [req.params.eventId, req.user.user_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Pending transaction not found.' });
    res.json({ success: true });
  } catch (error) { next(error); }
});

export default router;
