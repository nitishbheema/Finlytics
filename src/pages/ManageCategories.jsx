import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Plus, Trash2, Check, X, ArrowLeft, Tag, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ManageCategories() {
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('expense');
  const [typeFilter, setTypeFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingType, setEditingType] = useState('expense');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const url = typeFilter === 'all' ? '/categories' : `/categories?type=${typeFilter}`;
      const data = await api.get(url);
      if (data.success) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to load categories', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [typeFilter]);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    setMsg(null);

    try {
      const data = await api.post('/categories', {
        name: newCategory,
        type: newCategoryType,
      });
      setMsg({ type: 'success', text: data.message });
      setNewCategory('');
      fetchCategories();
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to add category.' });
    }
  };

  const handleStartEdit = (category) => {
    setEditingId(category.category_id);
    setEditingName(category.category_name);
    setEditingType(category.category_type || 'expense');
  };

  const handleSaveEdit = async (id) => {
    setMsg(null);
    try {
      const data = await api.put(`/categories/${id}`, {
        name: editingName,
        type: editingType,
      });
      setMsg({ type: 'success', text: data.message });
      setEditingId(null);
      setEditingName('');
      fetchCategories();
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update category.' });
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete category: ${name}?`)) return;
    setMsg(null);

    try {
      const data = await api.delete(`/categories/${id}`);
      setMsg({ type: 'success', text: data.message });
      fetchCategories();
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to delete category.' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18]">
            Manage Categories
          </h1>
          <p className="text-xs text-[#a8a8a3] light:text-[#5a5a55] mt-1">
            Create and maintain distinct categories for Income and Expense transactions
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

      {/* ADD CATEGORY */}
      <div className="p-5 md:p-6 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
        <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18] mb-4">
          Add New Category
        </h3>

        <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-full sm:flex-1">
            <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
              Category Name *
            </label>
            <input
              type="text"
              required
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="e.g. Consulting or Groceries"
              className="w-full px-3 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
            />
          </div>

          <div className="w-full sm:w-48">
            <label className="block text-xs font-medium text-[#a8a8a3] light:text-[#5a5a55] mb-1.5">
              Category Type *
            </label>
            <select
              value={newCategoryType}
              onChange={(e) => setNewCategoryType(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#1e1e21] light:bg-[#f0f0ee] border border-white/[0.07] light:border-black/[0.07] text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none focus:border-brand"
            >
              <option value="expense">Expense Category</option>
              <option value="income">Income Category</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-brand hover:bg-[#b56832] text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-glow transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Category</span>
          </button>
        </form>
      </div>

      {/* FILTER TABS */}
      <div className="flex gap-2 border-b border-white/[0.07] light:border-black/[0.07] pb-3">
        <button
          onClick={() => setTypeFilter('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
            typeFilter === 'all'
              ? 'bg-brand text-white shadow-glow font-semibold'
              : 'bg-white/[0.04] light:bg-black/[0.04] text-[#a8a8a3] hover:text-[#f2f2f0]'
          }`}
        >
          All Categories
        </button>
        <button
          onClick={() => setTypeFilter('expense')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
            typeFilter === 'expense'
              ? 'bg-[#e0655a] text-white shadow-glow font-semibold'
              : 'bg-white/[0.04] light:bg-black/[0.04] text-[#a8a8a3] hover:text-[#f2f2f0]'
          }`}
        >
          Expense Categories
        </button>
        <button
          onClick={() => setTypeFilter('income')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
            typeFilter === 'income'
              ? 'bg-[#5cb98a] text-white shadow-glow font-semibold'
              : 'bg-white/[0.04] light:bg-black/[0.04] text-[#a8a8a3] hover:text-[#f2f2f0]'
          }`}
        >
          Income Categories
        </button>
      </div>

      {/* CATEGORIES TABLE */}
      <div className="p-5 md:p-6 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
        <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18] mb-4 flex items-center gap-2">
          <span>Categories List</span>
          <span className="text-xs font-normal text-[#a8a8a3] light:text-[#5a5a55]">
            ({categories.length} total)
          </span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] light:border-black/[0.07] text-[#a8a8a3] light:text-[#5a5a55]">
                <th className="py-2.5 px-3 w-1/2">Category Name</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] light:divide-black/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-[#a8a8a3]">
                    Loading categories...
                  </td>
                </tr>
              ) : categories.length > 0 ? (
                categories.map((row) => (
                  <tr key={row.category_id} className="hover:bg-white/[0.02] light:hover:bg-black/[0.02]">
                    <td className="py-3 px-3">
                      {editingId === row.category_id ? (
                        <div className="flex items-center gap-2 max-w-sm">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#1e1e21] light:bg-[#f0f0ee] border border-brand text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveEdit(row.category_id)}
                            className="p-1.5 rounded-lg bg-[#5cb98a] text-white hover:bg-[#5cb98a]/80"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1.5 rounded-lg bg-white/[0.1] text-[#a8a8a3] hover:text-[#f2f2f0]"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="font-medium text-[#f2f2f0] light:text-[#1a1a18]">
                          {row.category_name}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {editingId === row.category_id ? (
                        <select
                          value={editingType}
                          onChange={(e) => setEditingType(e.target.value)}
                          className="px-2.5 py-1 rounded-lg bg-[#1e1e21] light:bg-[#f0f0ee] border border-brand text-[#f2f2f0] light:text-[#1a1a18] text-xs focus:outline-none"
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                        </select>
                      ) : row.category_type === 'income' ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#5cb98a]/15 text-[#5cb98a] border border-[#5cb98a]/20">
                          Income
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#e0655a]/15 text-[#e0655a] border border-[#e0655a]/20">
                          Expense
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {editingId !== row.category_id && (
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => handleStartEdit(row)}
                            className="px-2.5 py-1 rounded-lg bg-white/[0.05] light:bg-black/[0.05] text-[#a8a8a3] hover:text-[#f2f2f0] light:hover:text-[#1a1a18] text-[11px] font-medium transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(row.category_id, row.category_name)}
                            className="p-1.5 rounded-lg bg-[#e0655a]/15 text-[#e0655a] hover:bg-[#e0655a]/25 transition-colors"
                            title="Delete Category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-[#a8a8a3]">
                    No categories found for this selection.
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
