import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Plus, Edit2, Trash2, X, Check, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const incomeIcons = {
  Salary: '💼',
  Freelance: '💻',
  Investment: '📈',
  Business: '🏢',
  Rental: '🏠',
  Dividends: '🪙',
  Bonus: '🎁',
  Interest: '🏦',
  'Other Income': '💵',
  Other: '💵',
};

export default function AddIncome() {
  const [incomes, setIncomes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [loading, setLoading] = useState(true);

  // Form state
  const [editingId, setEditingId] = useState(null);
  const [categoryId, setCategoryId] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [formMsg, setFormMsg] = useState(null);

  const fetchCategories = async () => {
    try {
      const data = await api.get('/categories?type=income');
      if (data.success) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to load income categories', err);
    }
  };

  const fetchIncomes = async () => {
    try {
      setLoading(true);
      const data = await api.get('/income');
      if (data.success) {
        setIncomes(data.incomes);
        setTotalIncome(data.totalIncome);
      }
    } catch (err) {
      console.error('Failed to load incomes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchIncomes();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormMsg(null);

    const payload = {
      category_id: categoryId,
      custom_category: categoryId === 'custom' ? customCategory : undefined,
      amount: parseFloat(amount),
      transaction_date: date,
      description,
    };

    try {
      if (editingId) {
        await api.put(`/income/${editingId}`, payload);
        setFormMsg({ type: 'success', text: 'Income entry updated successfully!' });
      } else {
        await api.post('/income', payload);
        setFormMsg({ type: 'success', text: 'Income added successfully!' });
      }

      setEditingId(null);
      setCategoryId('');
      setCustomCategory('');
      setAmount('');
      setDescription('');
      setDate(new Date().toISOString().split('T')[0]);

      fetchIncomes();
      fetchCategories();
    } catch (err) {
      setFormMsg({ type: 'error', text: err.message || 'Failed to save income.' });
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.transaction_id);
    setCategoryId(item.category_id);
    setAmount(item.amount);
    setDate(item.transaction_date);
    setDescription(item.description || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this income?')) return;
    try {
      await api.delete(`/income/${id}`);
      fetchIncomes();
    } catch (err) {
      alert(err.message || 'Failed to delete income.');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setCategoryId('');
    setCustomCategory('');
    setAmount('');
    setDescription('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18]">
            {editingId ? '✏️ Edit Income' : 'Add Income'}
          </h1>
          <p className="text-xs text-[#a8a8a3] light:text-[#5a5a55] mt-1">
            Track your earnings, salary, client retainers and investments
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

      {formMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between ${
            formMsg.type === 'success'
              ? 'bg-[#5cb98a]/10 border border-[#5cb98a]/20 text-[#5cb98a]'
              : 'bg-[#e0655a]/10 border border-[#e0655a]/20 text-[#e0655a]'
          }`}
        >
          <span>{formMsg.text}</span>
          <button onClick={() => setFormMsg(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* FORM CARD */}
      <div className="p-5 md:p-6 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
        <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18] mb-4">
          {editingId ? 'Update Income Entry' : 'New Income Entry'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
                Income Category *
              </label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
              >
                <option value="">Select Income Category</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {incomeIcons[c.category_name] || '💵'} {c.category_name}
                  </option>
                ))}
                <option value="custom">➕ Add New Income Category</option>
              </select>
            </div>

            {categoryId === 'custom' && (
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-medium text-brand mb-1.5">
                  New Income Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. Dividend Income"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-brand/50 text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
                Amount (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5000"
                className="w-full px-3 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
                Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Monthly salary"
                className="w-full px-3 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="py-2.5 px-5 rounded-xl bg-brand hover:bg-[#b56832] text-white text-xs font-semibold flex items-center gap-2 shadow-glow transition-all"
            >
              {editingId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{editingId ? 'Update Income' : 'Add Income'}</span>
            </button>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="py-2.5 px-4 rounded-xl bg-white/[0.05] light:bg-black/[0.05] text-[#a8a8a3] light:text-[#5a5a55] hover:text-[#f2f2f0] light:hover:text-[#1a1a18] text-xs font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* RECENT INCOMES TABLE */}
      <div className="p-5 md:p-6 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
            Recent Incomes
          </h3>
          <span className="text-xs font-semibold text-[#5cb98a]">
            Total Income: ₹{Number(totalIncome).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] light:border-black/[0.07] text-[#a8a8a3] light:text-[#5a5a55]">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] light:divide-black/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#a8a8a3]">
                    Loading income records...
                  </td>
                </tr>
              ) : incomes.length > 0 ? (
                incomes.map((row) => (
                  <tr key={row.transaction_id} className="hover:bg-white/[0.02] light:hover:bg-black/[0.02]">
                    <td className="py-3 px-3 text-[#a8a8a3] light:text-[#5a5a55] whitespace-nowrap">
                      {row.transaction_date}
                    </td>
                    <td className="py-3 px-3 font-medium text-[#f2f2f0] light:text-[#1a1a18]">
                      <span>{incomeIcons[row.category_name] || '💵'}</span>{' '}
                      <span>{row.category_name}</span>
                    </td>
                    <td className="py-3 px-3 text-[#a8a8a3] light:text-[#5a5a55]">
                      {row.description || '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-[#5cb98a] whitespace-nowrap">
                      ₹{Number(row.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(row)}
                          className="p-1.5 rounded-lg bg-[#d4a84b]/15 text-[#d4a84b] hover:bg-[#d4a84b]/25 transition-colors"
                          title="Edit Income"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(row.transaction_id)}
                          className="p-1.5 rounded-lg bg-[#e0655a]/15 text-[#e0655a] hover:bg-[#e0655a]/25 transition-colors"
                          title="Delete Income"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#a8a8a3]">
                    No income records logged yet.
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
