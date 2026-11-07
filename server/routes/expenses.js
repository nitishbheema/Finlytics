import express from 'express';
import { query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET EXPENSES (with pagination, category filtering, search, and view summary total)
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    const { category, search, page = 1, limit = 8 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['e.user_id = $1'];
    const params = [uid];
    let paramIndex = 2;

    if (category && category.trim() !== '') {
      conditions.push(`c.category_name = $${paramIndex}`);
      params.push(category.trim());
      paramIndex++;
    }

    if (search && search.trim() !== '') {
      conditions.push(`LOWER(e.description) LIKE $${paramIndex}`);
      params.push(`%${search.trim().toLowerCase()}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Total count & sum for the current filter
    const countAndSumRes = await query(
      `SELECT COUNT(*) AS total_count, COALESCE(SUM(e.amount), 0) AS total_sum
       FROM expenses e
       JOIN categories c ON e.category_id = c.category_id
       WHERE ${whereClause}`,
      params
    );

    const totalCount = parseInt(countAndSumRes.rows[0].total_count, 10);
    const totalSum = parseFloat(countAndSumRes.rows[0].total_sum);
    const totalPages = Math.ceil(totalCount / limitNum);

    // Paginated expenses
    const listParams = [...params, limitNum, offset];
    const expensesRes = await query(
      `SELECT e.expense_id, e.category_id, c.category_name, c.category_type, e.amount, e.expense_date, e.description, e.created_at
       FROM expenses e
       JOIN categories c ON e.category_id = c.category_id
       WHERE ${whereClause}
       ORDER BY e.expense_date DESC, e.expense_id DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      listParams
    );

    res.json({
      success: true,
      expenses: expensesRes.rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount),
        expense_date: r.expense_date.toISOString().split('T')[0]
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRows: totalCount,
        totalPages: totalPages || 1,
      },
      totalSummary: totalSum,
    });
  } catch (error) {
    next(error);
  }
});

// GET EXPORT DATA (All expenses for PDF / CSV reports)
router.get('/export', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;

    const result = await query(
      `SELECT e.expense_id, e.category_id, c.category_name, c.category_type, e.amount, e.expense_date, e.description, e.created_at
       FROM expenses e
       JOIN categories c ON e.category_id = c.category_id
       WHERE e.user_id = $1
       ORDER BY e.expense_date DESC`,
      [uid]
    );

    const totalRes = await query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = $1',
      [uid]
    );

    res.json({
      success: true,
      expenses: result.rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount),
        expense_date: r.expense_date.toISOString().split('T')[0]
      })),
      total: parseFloat(totalRes.rows[0].total)
    });
  } catch (error) {
    next(error);
  }
});

// GET SINGLE EXPENSE
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    const { id } = req.params;

    const result = await query(
      `SELECT e.expense_id, e.category_id, c.category_name, c.category_type, e.amount, e.expense_date, e.description
       FROM expenses e
       JOIN categories c ON e.category_id = c.category_id
       WHERE e.expense_id = $1 AND e.user_id = $2`,
      [id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      expense: {
        ...row,
        amount: parseFloat(row.amount),
        expense_date: row.expense_date.toISOString().split('T')[0],
      },
    });
  } catch (error) {
    next(error);
  }
});

// CREATE EXPENSE
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    let { category_id, amount, expense_date, description, custom_category } = req.body;

    if (!amount || (!category_id && !custom_category)) {
      return res.status(400).json({ success: false, message: 'Category and amount are required.' });
    }

    // Support creating expense category on-the-fly
    if (category_id === 'custom' || (!category_id && custom_category)) {
      const catName = (custom_category || '').trim();
      if (!catName) {
        return res.status(400).json({ success: false, message: 'Please provide a valid category name.' });
      }
      const existingCat = await query(
        'SELECT category_id, category_type FROM categories WHERE LOWER(category_name) = LOWER($1) AND category_type = $2',
        [catName, 'expense']
      );
      if (existingCat.rows.length > 0) {
        category_id = existingCat.rows[0].category_id;
      } else {
        const insertCat = await query(
          'INSERT INTO categories (category_name, category_type) VALUES ($1, $2) RETURNING category_id',
          [catName, 'expense']
        );
        category_id = insertCat.rows[0].category_id;
      }
    } else {
      // Validate category exists and is an expense category
      const catCheck = await query('SELECT category_id, category_type FROM categories WHERE category_id = $1', [category_id]);
      if (catCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Selected category does not exist.' });
      }
      if (catCheck.rows[0].category_type !== 'expense') {
        return res.status(400).json({ success: false, message: 'Expenses can only use expense categories.' });
      }
    }

    const dateVal = expense_date || new Date().toISOString().split('T')[0];
    const descVal = description ? description.trim() : '';

    const result = await query(
      `INSERT INTO expenses (user_id, category_id, amount, expense_date, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING expense_id, category_id, amount, expense_date, description, created_at`,
      [uid, category_id, parseFloat(amount), dateVal, descVal]
    );

    res.status(201).json({
      success: true,
      message: 'Expense added successfully.',
      expense: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// UPDATE EXPENSE
router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    const { id } = req.params;
    let { category_id, amount, expense_date, description, custom_category } = req.body;

    if (!amount || (!category_id && !custom_category)) {
      return res.status(400).json({ success: false, message: 'Category and amount are required.' });
    }

    if (category_id === 'custom' || (!category_id && custom_category)) {
      const catName = (custom_category || '').trim();
      const existingCat = await query(
        'SELECT category_id, category_type FROM categories WHERE LOWER(category_name) = LOWER($1) AND category_type = $2',
        [catName, 'expense']
      );
      if (existingCat.rows.length > 0) {
        category_id = existingCat.rows[0].category_id;
      } else {
        const insertCat = await query(
          'INSERT INTO categories (category_name, category_type) VALUES ($1, $2) RETURNING category_id',
          [catName, 'expense']
        );
        category_id = insertCat.rows[0].category_id;
      }
    } else {
      const catCheck = await query('SELECT category_id, category_type FROM categories WHERE category_id = $1', [category_id]);
      if (catCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Selected category does not exist.' });
      }
      if (catCheck.rows[0].category_type !== 'expense') {
        return res.status(400).json({ success: false, message: 'Expenses can only use expense categories.' });
      }
    }

    const dateVal = expense_date || new Date().toISOString().split('T')[0];
    const descVal = description ? description.trim() : '';

    const result = await query(
      `UPDATE expenses
       SET category_id = $1, amount = $2, expense_date = $3, description = $4
       WHERE expense_id = $5 AND user_id = $6
       RETURNING expense_id, category_id, amount, expense_date, description`,
      [category_id, parseFloat(amount), dateVal, descVal, id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Expense not found or unauthorized.' });
    }

    res.json({
      success: true,
      message: 'Expense updated successfully.',
      expense: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// DELETE EXPENSE
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM expenses WHERE expense_id = $1 AND user_id = $2 RETURNING expense_id',
      [id, uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Expense not found or unauthorized.' });
    }

    res.json({ success: true, message: 'Expense deleted successfully.' });
  } catch (error) {
    next(error);
  }
});

export default router;
