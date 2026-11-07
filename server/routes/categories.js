import express from 'express';
import { query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET ALL CATEGORIES
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const result = await query('SELECT category_id, category_name FROM categories ORDER BY category_name ASC');
    res.json({ success: true, categories: result.rows });
  } catch (error) {
    next(error);
  }
});

// ADD NEW CATEGORY
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    const trimmed = name.trim();
    const existing = await query('SELECT category_id FROM categories WHERE LOWER(category_name) = LOWER($1)', [trimmed]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Category already exists.' });
    }

    const result = await query(
      'INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id, category_name',
      [trimmed]
    );

    res.status(201).json({
      success: true,
      message: `Category '${trimmed}' added successfully.`,
      category: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// UPDATE CATEGORY
router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    const trimmed = name.trim();
    const result = await query(
      'UPDATE categories SET category_name = $1 WHERE category_id = $2 RETURNING category_id, category_name',
      [trimmed, id]
    );

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

// GET CATEGORY BUDGETS AND SPENT
router.get('/budgets/overview', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;

    const result = await query(
      `SELECT
          c.category_id,
          c.category_name,
          COALESCE(cb.budget, 0) AS budget,
          COALESCE(SUM(e.amount), 0) AS spent
       FROM categories c
       LEFT JOIN category_budgets cb ON c.category_id = cb.category_id AND cb.user_id = $1
       LEFT JOIN expenses e ON e.category_id = c.category_id AND e.user_id = $1
       GROUP BY c.category_id, c.category_name, cb.budget
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

// SET OR UPDATE CATEGORY BUDGET
router.post('/budgets', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    const { category_id, budget } = req.body;

    if (!category_id || budget === undefined || budget === null) {
      return res.status(400).json({ success: false, message: 'Category and budget are required.' });
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
