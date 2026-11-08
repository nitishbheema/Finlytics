import { query } from '../config/db.js';
import { sha256 } from '../utils/autotrack.js';

export async function authenticateAutoTrackDevice(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token.length < 32 || token.length > 128) {
      return res.status(401).json({ success: false, message: 'A valid paired device token is required.' });
    }

    const result = await query(
      `SELECT device_id, user_id, device_name
         FROM public.autotrack_devices
        WHERE token_hash = $1 AND revoked_at IS NULL`,
      [sha256(token)]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'This device is not paired or has been disconnected.' });
    }

    req.autoTrackDevice = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}
