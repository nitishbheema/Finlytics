import express from 'express';
import { query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/summary', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;

    // Fetch user details
    const userRes = await query('SELECT name, budget, photo FROM users WHERE user_id = $1', [uid]);
    const userData = userRes.rows[0] || { name: 'User', budget: 0, photo: null };
    const budget = parseFloat(userData.budget || 0);

    // Total expense
    const expenseRes = await query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = $1',
      [uid]
    );
    const expenseTotal = parseFloat(expenseRes.rows[0].total || 0);

    // Total income
    const incomeRes = await query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = $1 AND type = 'income'",
      [uid]
    );
    const incomeTotal = parseFloat(incomeRes.rows[0].total || 0);

    const netSavings = incomeTotal - expenseTotal;
    const remaining = Math.max(budget - expenseTotal, 0);
    const budgetExceeded = budget > 0 && expenseTotal > budget;
    const budgetPercent = budget > 0 ? Math.min(100, (expenseTotal / budget) * 100) : 0;

    // Current & previous month totals
    const currentMonthRes = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses 
       WHERE user_id = $1 AND EXTRACT(MONTH FROM expense_date) = EXTRACT(MONTH FROM CURRENT_DATE)
       AND EXTRACT(YEAR FROM expense_date) = EXTRACT(YEAR FROM CURRENT_DATE)`,
      [uid]
    );
    const currentMonthTotal = parseFloat(currentMonthRes.rows[0].total || 0);

    const prevMonthRes = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses 
       WHERE user_id = $1 AND EXTRACT(MONTH FROM expense_date) = EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '1 month'))
       AND EXTRACT(YEAR FROM expense_date) = EXTRACT(YEAR FROM (CURRENT_DATE - INTERVAL '1 month'))`,
      [uid]
    );
    const prevMonthTotal = parseFloat(prevMonthRes.rows[0].total || 0);

    const comparison = prevMonthTotal > 0
      ? ((currentMonthTotal - prevMonthTotal) / prevMonthTotal) * 100
      : 0;

    // Top spending category
    const topCatRes = await query(
      `SELECT c.category_name, SUM(e.amount) AS total
       FROM expenses e
       JOIN categories c ON e.category_id = c.category_id
       WHERE e.user_id = $1
       GROUP BY c.category_name
       HAVING SUM(e.amount) > 0
       ORDER BY total DESC
       LIMIT 1`,
      [uid]
    );
    const topCategory = topCatRes.rows.length > 0
      ? { name: topCatRes.rows[0].category_name, total: parseFloat(topCatRes.rows[0].total) }
      : null;

    // Financial health score
    let score = 100;
    if (budgetPercent > 100) score -= 40;
    else if (budgetPercent > 80) score -= 20;
    if (comparison > 20) score -= 15;
    score = Math.max(0, score);

    // AI Insight logic
    let aiInsight = '';
    if (budgetExceeded) {
      aiInsight = '⚠ Your spending crossed the budget. Review your high-value expenses immediately.';
    } else if (remaining > (budget * 0.5) && budget > 0) {
      aiInsight = 'Excellent control! More than 50% of your budget remains. Keep it up.';
    } else if (comparison > 20) {
      aiInsight = 'Your spending has increased significantly vs last month. Monitor upcoming expenses.';
    } else {
      aiInsight = 'Spending is moderate. Continue tracking to maintain healthy finances.';
    }

    // Recent 5 expenses
    const recentRes = await query(
      `SELECT e.expense_id, e.amount, e.description, e.expense_date, c.category_name
       FROM expenses e
       JOIN categories c ON e.category_id = c.category_id
       WHERE e.user_id = $1
       ORDER BY e.expense_date DESC, e.expense_id DESC
       LIMIT 5`,
      [uid]
    );

    res.json({
      success: true,
      data: {
        username: userData.name,
        photo: userData.photo,
        budget,
        incomeTotal,
        expenseTotal,
        netSavings,
        remaining,
        budgetExceeded,
        budgetPercent: Math.round(budgetPercent),
        comparison: parseFloat(comparison.toFixed(1)),
        topCategory,
        healthScore: score,
        aiInsight,
        recentExpenses: recentRes.rows.map(r => ({
          ...r,
          amount: parseFloat(r.amount),
          expense_date: r.expense_date.toISOString().split('T')[0]
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET CHARTS DATA (Distribution & Monthly Trend)
router.get('/charts', authenticateToken, async (req, res, next) => {
  try {
    const uid = req.user.user_id;

    // Category distribution
    const catRes = await query(
      `SELECT c.category_name, SUM(e.amount) AS total
       FROM expenses e
       JOIN categories c ON e.category_id = c.category_id
       WHERE e.user_id = $1
       GROUP BY c.category_name
       HAVING SUM(e.amount) > 0
       ORDER BY total DESC`,
      [uid]
    );

    // Monthly trend (past 12 months)
    const monthRes = await query(
      `SELECT TO_CHAR(expense_date, 'Mon YYYY') AS month_label,
              EXTRACT(YEAR FROM expense_date) AS yr,
              EXTRACT(MONTH FROM expense_date) AS mo,
              SUM(amount) AS total
       FROM expenses
       WHERE e.user_id = $1
       GROUP BY yr, mo, month_label
       ORDER BY yr ASC, mo ASC
       LIMIT 12`
        .replace('e.user_id', 'user_id'),
      [uid]
    );

    res.json({
      success: true,
      categories: catRes.rows.map(r => r.category_name),
      categoryAmounts: catRes.rows.map(r => parseFloat(r.total)),
      months: monthRes.rows.map(r => r.month_label),
      monthlyAmounts: monthRes.rows.map(r => parseFloat(r.total)),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
