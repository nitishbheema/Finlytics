import express from 'express';
import { query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET CATEGORIES (optionally filtered by ?type=income or ?type=expense)
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT category_id, category_name, category_type FROM categories';
    const params = [];

    if (type) {
      const normalizedType = type.toLowerCase().trim();
      if (normalizedType === 'income' || normalizedType === 'expense') {
        sql += ' WHERE category_type = $1';
        params.push(normalizedType);
      }
    }

    sql += ' ORDER BY category_name ASC';
    const result = await query(sql, params);

    res.json({ success: true, categories: result.rows });
  } catch (error) {
    next(error);
  }
});

// ADD NEW CATEGORY (validates type: 'income' or 'expense')
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { name, type = 'expense' } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    const normalizedType = (type || 'expense').toLowerCase().trim();
    if (normalizedType !== 'income' && normalizedType !== 'expense') {
      return res.status(400).json({ success: false, message: "Category type must be either 'income' or 'expense'." });
    }

    const trimmed = name.trim();
    const existing = await query(
      'SELECT category_id FROM categories WHERE LOWER(category_name) = LOWER($1) AND category_type = $2',
      [trimmed, normalizedType]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Category '${trimmed}' already exists under ${normalizedType} categories.`,
      });
    }

    const result = await query(
      'INSERT INTO categories (category_name, category_type) VALUES ($1, $2) RETURNING category_id, category_name, category_type',
      [trimmed, normalizedType]
    );

    res.status(201).json({
      success: true,
      message: `Category '${trimmed}' added successfully as ${normalizedType}.`,
      category: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// UPDATE CATEGORY (Name and Type)
router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, type } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    const trimmed = name.trim();
    let result;

    if (type) {
      const normalizedType = type.toLowerCase().trim();
      if (normalizedType !== 'income' && normalizedType !== 'expense') {
        return res.status(400).json({ success: false, message: "Category type must be either 'income' or 'expense'." });
      }

      result = await query(
        'UPDATE categories SET category_name = $1, category_type = $2 WHERE category_id = $3 RETURNING category_id, category_name, category_type',
        [trimmed, normalizedType, id]
      );
    } else {
      result = await query(
        'UPDATE categories SET category_name = $1 WHERE category_id = $2 RETURNING category_id, category_name, category_type',
        [trimmed, id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    res.json({
      success: true,
      message: 'Category updated successfully.',
      category: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// DELETE CATEGORY (Protected if used in transactions or expenses)
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    const txCheck = await query('SELECT COUNT(*) AS total FROM transactions WHERE category_id = $1', [id]);
    const expCheck = await query('SELECT COUNT(*) AS total FROM expenses WHERE category_id = $1', [id]);

    const totalUsage = parseInt(txCheck.rows[0].total, 10) + parseInt(expCheck.rows[0].total, 10);
    if (totalUsage > 0) {
      return res.status(400).json({
        success: false,
        message: '⚠ Cannot delete: this category is used in existing transactions or expenses.',
      });
    }

    const result = await query('DELETE FROM categories WHERE category_id = $1 RETURNING category_id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    res.json({ success: true, message: 'Category deleted successfully.' });
  } catch (error) {
    next(error);
  }
});

// GET CATEGORY BUDGETS AND SPENT (Only for Expense categories)
router.get('/budgets/overview', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;

    const result = await query(
      `SELECT
          c.category_id,
          c.category_name,
          c.category_type,
          COALESCE(cb.budget, 0) AS budget,
          COALESCE(SUM(e.amount), 0) AS spent
       FROM categories c
       LEFT JOIN category_budgets cb ON c.category_id = cb.category_id AND cb.user_id = $1
       LEFT JOIN expenses e ON e.category_id = c.category_id AND e.user_id = $1
       WHERE c.category_type = 'expense'
       GROUP BY c.category_id, c.category_name, c.category_type, cb.budget
       ORDER BY c.category_name ASC`,
      [uid]
    );

    const budgets = result.rows.map(row => {
      const budget = parseFloat(row.budget || 0);
      const spent = parseFloat(row.spent || 0);
      const remaining = Math.max(budget - spent, 0);
      const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

      let status = 'No budget';
      let statusColor = 'muted';
      if (budget > 0) {
        if (pct >= 100) {
          status = 'Exceeded';
          statusColor = 'danger';
        } else if (pct >= 75) {
          status = 'Near limit';
          statusColor = 'warning';
        } else {
          status = 'Good';
          statusColor = 'success';
        }
      }

      return {
        category_id: row.category_id,
        category_name: row.category_name,
        category_type: row.category_type,
        budget,
        spent,
        remaining,
        usagePercent: pct,
        status,
        statusColor,
      };
    });

    res.json({ success: true, budgets });
  } catch (error) {
    next(error);
  }
});

// SET OR UPDATE CATEGORY BUDGET (Only for Expense categories)
router.post('/budgets', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    const { category_id, budget } = req.body;

    if (!category_id || budget === undefined || budget === null) {
      return res.status(400).json({ success: false, message: 'Category and budget are required.' });
    }

    // Verify category is an expense category
    const catCheck = await query('SELECT category_id, category_type FROM categories WHERE category_id = $1', [category_id]);
    if (catCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    if (catCheck.rows[0].category_type !== 'expense') {
      return res.status(400).json({ success: false, message: 'Budgets can only be set for expense categories.' });
    }

    const budgetVal = parseFloat(budget);
    if (isNaN(budgetVal) || budgetVal < 0) {
      return res.status(400).json({ success: false, message: 'Budget must be a non-negative number.' });
    }

    const result = await query(
      `INSERT INTO category_budgets (user_id, category_id, budget)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, category_id)
       DO UPDATE SET budget = EXCLUDED.budget
       RETURNING id, category_id, budget`,
      [uid, category_id, budgetVal]
    );

    res.json({
      success: true,
      message: 'Budget saved successfully.',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

export default router;
