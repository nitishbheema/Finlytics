import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// UPDATE PROFILE (Name, Budget, Photo/Avatar)
router.put('/profile', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    const { name, budget, photo } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }

    const budgetVal = budget !== undefined && budget !== null ? parseFloat(budget) : 0;
    const trimmedName = name.trim();

    let result;
    if (photo !== undefined) {
      result = await query(
        `UPDATE users
         SET name = $1, budget = $2, photo = $3
         WHERE user_id = $4
         RETURNING user_id, name, email, budget, photo`,
        [trimmedName, budgetVal, photo, uid]
      );
    } else {
      result = await query(
        `UPDATE users
         SET name = $1, budget = $2
         WHERE user_id = $3
         RETURNING user_id, name, email, budget, photo`,
        [trimmedName, budgetVal, uid]
      );
    }

    const updatedUser = result.rows[0];
    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        user_id: updatedUser.user_id,
        name: updatedUser.name,
        email: updatedUser.email,
        budget: parseFloat(updatedUser.budget || 0),
        photo: updatedUser.photo,
      },
    });
  } catch (error) {
    next(error);
  }
});

// CHANGE PASSWORD
router.put('/change-password', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    const { current, newPassword, confirmPassword } = req.body;

    if (!current || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All password fields are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New passwords do not match.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const userRes = await query('SELECT password FROM users WHERE user_id = $1', [uid]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(current, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);

    await query('UPDATE users SET password = $1 WHERE user_id = $2', [hashed, uid]);

    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (error) {
    next(error);
  }
});

export default router;
