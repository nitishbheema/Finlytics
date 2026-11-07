import express from 'express';
import { query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET INCOMES (with total income sum)
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;

    const listRes = await query(
      `SELECT t.transaction_id, t.category_id, c.category_name, c.category_type, t.amount, t.description, t.transaction_date, t.created_at
       FROM transactions t
       JOIN categories c ON t.category_id = c.category_id
       WHERE t.user_id = $1 AND t.type = 'income'
       ORDER BY t.transaction_date DESC, t.transaction_id DESC`,
      [uid]
    );

    const totalRes = await query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = $1 AND type = 'income'",
      [uid]
    );

    res.json({
      success: true,
      incomes: listRes.rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount),
        transaction_date: r.transaction_date.toISOString().split('T')[0]
      })),
      totalIncome: parseFloat(totalRes.rows[0].total),
    });
  } catch (error) {
    next(error);
  }
});

// GET SINGLE INCOME
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    const { id } = req.params;

    const result = await query(
      `SELECT t.transaction_id, t.category_id, c.category_name, c.category_type, t.amount, t.description, t.transaction_date
       FROM transactions t
       JOIN categories c ON t.category_id = c.category_id
       WHERE t.transaction_id = $1 AND t.user_id = $2 AND t.type = 'income'`,
      [id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Income transaction not found.' });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      income: {
        ...row,
        amount: parseFloat(row.amount),
        transaction_date: row.transaction_date.toISOString().split('T')[0],
      },
    });
  } catch (error) {
    next(error);
  }
});

// CREATE INCOME
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    let { category_id, amount, transaction_date, description, custom_category } = req.body;

    if (!amount || (!category_id && !custom_category)) {
      return res.status(400).json({ success: false, message: 'Category and amount are required.' });
    }

    // Support creating income category on-the-fly
    if (category_id === 'custom' || (!category_id && custom_category)) {
      const catName = (custom_category || '').trim();
      if (!catName) {
        return res.status(400).json({ success: false, message: 'Please provide a valid category name.' });
      }
      const existingCat = await query(
        'SELECT category_id, category_type FROM categories WHERE LOWER(category_name) = LOWER($1) AND category_type = $2',
        [catName, 'income']
      );
      if (existingCat.rows.length > 0) {
        category_id = existingCat.rows[0].category_id;
      } else {
        const insertCat = await query(
          'INSERT INTO categories (category_name, category_type) VALUES ($1, $2) RETURNING category_id',
          [catName, 'income']
        );
        category_id = insertCat.rows[0].category_id;
      }
    } else {
      // Validate category exists and is an income category
      const catCheck = await query('SELECT category_id, category_type FROM categories WHERE category_id = $1', [category_id]);
      if (catCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Selected category does not exist.' });
      }
      if (catCheck.rows[0].category_type !== 'income') {
        return res.status(400).json({ success: false, message: 'Income transactions can only use income categories.' });
      }
    }

    const dateVal = transaction_date || new Date().toISOString().split('T')[0];
    const descVal = description ? description.trim() : '';

    const result = await query(
      `INSERT INTO transactions (user_id, category_id, amount, type, description, transaction_date)
       VALUES ($1, $2, $3, 'income', $4, $5)
       RETURNING transaction_id, category_id, amount, type, description, transaction_date`,
      [uid, category_id, parseFloat(amount), descVal, dateVal]
    );

    res.status(201).json({
      success: true,
      message: 'Income added successfully.',
      income: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// UPDATE INCOME
router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    const { id } = req.params;
    let { category_id, amount, transaction_date, description, custom_category } = req.body;

    if (!amount || (!category_id && !custom_category)) {
      return res.status(400).json({ success: false, message: 'Category and amount are required.' });
    }

    if (category_id === 'custom' || (!category_id && custom_category)) {
      const catName = (custom_category || '').trim();
      const existingCat = await query(
        'SELECT category_id, category_type FROM categories WHERE LOWER(category_name) = LOWER($1) AND category_type = $2',
        [catName, 'income']
      );
      if (existingCat.rows.length > 0) {
        category_id = existingCat.rows[0].category_id;
      } else {
        const insertCat = await query(
          'INSERT INTO categories (category_name, category_type) VALUES ($1, $2) RETURNING category_id',
          [catName, 'income']
        );
        category_id = insertCat.rows[0].category_id;
      }
    } else {
      const catCheck = await query('SELECT category_id, category_type FROM categories WHERE category_id = $1', [category_id]);
      if (catCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Selected category does not exist.' });
      }
      if (catCheck.rows[0].category_type !== 'income') {
        return res.status(400).json({ success: false, message: 'Income transactions can only use income categories.' });
      }
    }

    const dateVal = transaction_date || new Date().toISOString().split('T')[0];
    const descVal = description ? description.trim() : '';

    const result = await query(
      `UPDATE transactions
       SET category_id = $1, amount = $2, description = $3, transaction_date = $4
       WHERE transaction_id = $5 AND user_id = $6 AND type = 'income'
       RETURNING transaction_id, category_id, amount, description, transaction_date`,
      [category_id, parseFloat(amount), descVal, dateVal, id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Income transaction not found or unauthorized.' });
    }

    res.json({
      success: true,
      message: 'Income updated successfully.',
      income: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// DELETE INCOME
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    const { id } = req.params;

    const result = await query(
      "DELETE FROM transactions WHERE transaction_id = $1 AND user_id = $2 AND type = 'income' RETURNING transaction_id",
      [id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Income transaction not found or unauthorized.' });
    }

    res.json({ success: true, message: 'Income deleted successfully.' });
  } catch (error) {
    next(error);
  }
});

export default router;
