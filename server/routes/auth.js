import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// REGISTER
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    // Check if user already exists
    const existing = await query('SELECT user_id FROM users WHERE LOWER(email) = $1', [trimmedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'This email is already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await query(
      'INSERT INTO users (name, email, password, budget) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email, budget, photo',
      [trimmedName, trimmedEmail, hashedPassword, 0]
    );

    const user = result.rows[0];
    const token = generateToken({ user_id: user.user_id, email: user.email, name: user.name });

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        budget: parseFloat(user.budget || 0),
        photo: user.photo,
      },
    });
  } catch (error) {
    next(error);
  }
});

// LOGIN
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const result = await query(
      'SELECT user_id, name, email, password, budget, photo FROM users WHERE LOWER(email) = $1',
      [trimmedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = generateToken({ user_id: user.user_id, email: user.email, name: user.name });

    res.json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        budget: parseFloat(user.budget || 0),
        photo: user.photo,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET CURRENT USER PROFILE
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT user_id, name, email, budget, photo, created_at FROM users WHERE user_id = $1',
      [req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const user = result.rows[0];
    res.json({
      success: true,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        budget: parseFloat(user.budget || 0),
        photo: user.photo,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
