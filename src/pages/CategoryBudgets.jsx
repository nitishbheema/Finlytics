import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Target, Save, X, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CategoryBudgets() {
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const [catsRes, budgetsRes] = await Promise.all([
        api.get('/categories?type=expense'),
        api.get('/categories/budgets/overview'),
      ]);

      if (catsRes.success) setCategories(catsRes.categories);
      if (budgetsRes.success) setBudgets(budgetsRes.budgets);
    } catch (err) {
      console.error('Failed to load category budgets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleSaveBudget = async (e) => {
    e.preventDefault();
    setMsg(null);

    try {
      await api.post('/categories/budgets', {
        category_id: selectedCat,
        budget: parseFloat(budgetAmount),
      });

      setMsg({ type: 'success', text: '✅ Category budget saved successfully!' });
      setSelectedCat('');
      setBudgetAmount('');
      fetchOverview();
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to save category budget.' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18]">
            Category Budgets
          </h1>
          <p className="text-xs text-[#a8a8a3] light:text-[#5a5a55] mt-1">
            Establish individual spending thresholds for each expense category
          </p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.05] light:bg-black/[0.05] hover:bg-white/[0.08] light:hover:bg-black/[0.08] text-[#f2f2f0] light:text-[#1a1a18] self-start sm:self-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between ${
            msg.type === 'success'
              ? 'bg-[#5cb98a]/10 border border-[#5cb98a]/20 text-[#5cb98a]'
              : 'bg-[#e0655a]/10 border border-[#e0655a]/20 text-[#e0655a]'
          }`}
        >
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SET BUDGET FORM */}
      <div className="p-5 md:p-6 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
        <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18] mb-4">
          Set an Expense Category Budget
        </h3>

        <form onSubmit={handleSaveBudget} className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-full sm:flex-1">
            <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
              Select Expense Category
            </label>
            <select
              required
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
            >
              <option value="">Choose expense category...</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.category_name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:flex-1">
            <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
              Budget Amount (₹)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full px-3 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
            />
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-brand hover:bg-[#b56832] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-glow transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Budget</span>
          </button>
        </form>
      </div>

      {/* OVERVIEW TABLE */}
      <div className="p-5 md:p-6 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
        <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18] mb-4">
          Expense Budget Overview
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] light:border-black/[0.07] text-[#a8a8a3] light:text-[#5a5a55]">
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Budget</th>
                <th className="py-2.5 px-3">Spent</th>
                <th className="py-2.5 px-3">Remaining</th>
                <th className="py-2.5 px-3" style={{ minWidth: 150 }}>Usage</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] light:divide-black/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#a8a8a3]">
                    Loading category budgets...
                  </td>
                </tr>
              ) : budgets.length > 0 ? (
                budgets.map((row) => (
                  <tr key={row.category_id} className="hover:bg-white/[0.02] light:hover:bg-black/[0.02]">
                    <td className="py-3 px-3 font-medium text-[#f2f2f0] light:text-[#1a1a18]">
                      {row.category_name}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      ₹{Number(row.budget).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 font-semibold text-[#e0655a] whitespace-nowrap">
                      ₹{Number(row.spent).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.budget > 0 ? (
                        <span
                          className={`font-semibold ${
                            row.remaining > 0 ? 'text-[#5cb98a]' : 'text-[#e0655a]'
                          }`}
                        >
                          ₹{Number(row.remaining).toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span className="text-[#636360]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {row.budget > 0 ? (
                        <div>
                          <div className="w-full h-2 rounded-full bg-white/[0.06] light:bg-black/[0.06] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                row.usagePercent >= 100
                                  ? 'bg-[#e0655a]'
                                  : row.usagePercent >= 75
                                  ? 'bg-[#d4a84b]'
                                  : 'bg-[#5cb98a]'
                              }`}
                              style={{ width: `${Math.min(row.usagePercent, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-[#a8a8a3] mt-1 block">
                            {row.usagePercent}% used
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#636360]">Not set</span>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {row.budget === 0 ? (
                        <span className="text-[#636360]">No budget</span>
                      ) : row.usagePercent >= 100 ? (
                        <span className="px-2 py-0.5 rounded-md bg-[#e0655a]/15 text-[#e0655a] font-semibold text-[11px]">
                          ⚠ Exceeded
                        </span>
                      ) : row.usagePercent >= 75 ? (
                        <span className="px-2 py-0.5 rounded-md bg-[#d4a84b]/15 text-[#d4a84b] font-semibold text-[11px]">
                          ⚡ Near limit
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-[#5cb98a]/15 text-[#5cb98a] font-semibold text-[11px]">
                          ✅ Good
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#a8a8a3]">
                    No expense categories found. Add categories to configure budgets.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
