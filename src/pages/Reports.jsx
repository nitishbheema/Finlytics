import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { exportExpensesToPDF } from '../utils/pdfExport';
import { FileDown, Calendar, ArrowLeft, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Reports() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchExportData = async () => {
    try {
      setLoading(true);
      const data = await api.get('/expenses/export');
      if (data.success) {
        setExpenses(data.expenses);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to load export data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExportData();
  }, []);

  const handleExport = () => {
    setExporting(true);
    try {
      exportExpensesToPDF(expenses, user, total);
    } catch (err) {
      console.error('Export error', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18]">
            Financial Reports & PDF Export
          </h1>
          <p className="text-xs text-[#a8a8a3] light:text-[#5a5a55] mt-1">
            Generate and download formal statements of your financial expenditures
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.05] light:bg-black/[0.05] hover:bg-white/[0.08] light:hover:bg-black/[0.08] text-[#f2f2f0] light:text-[#1a1a18]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </Link>
          <button
            onClick={handleExport}
            disabled={exporting || expenses.length === 0}
            className="inline-flex items-center gap-2 py-2 px-4 rounded-xl bg-brand hover:bg-[#b56832] text-white text-xs font-semibold shadow-glow transition-all disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" />
            <span>{exporting ? 'Generating PDF...' : 'Download PDF Report'}</span>
          </button>
        </div>
      </div>

      {/* SUMMARY STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55] font-medium block">
            Total Logged Expenses
          </span>
          <p className="text-2xl font-bold font-display text-[#e0655a] mt-2">
            ₹{Number(total).toLocaleString('en-IN')}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55] font-medium block">
            Total Record Count
          </span>
          <p className="text-2xl font-bold font-display text-brand mt-2">
            {expenses.length}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55] font-medium block">
            Document Owner
          </span>
          <p className="text-lg font-bold font-display text-[#f2f2f0] light:text-[#1a1a18] mt-2 truncate">
            {user?.name}
          </p>
          <span className="text-xs text-[#636360] block truncate">{user?.email}</span>
        </div>
      </div>

      {/* REPORT PREVIEW TABLE */}
      <div className="p-5 md:p-6 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
            Statement Preview
          </h3>
          <span className="text-xs text-[#a8a8a3]">
            Ready for PDF generation
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
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] light:divide-black/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[#a8a8a3]">
                    Loading statement records...
                  </td>
                </tr>
              ) : expenses.length > 0 ? (
                expenses.map((row) => (
                  <tr key={row.expense_id} className="hover:bg-white/[0.02] light:hover:bg-black/[0.02]">
                    <td className="py-3 px-3 text-[#a8a8a3] light:text-[#5a5a55] whitespace-nowrap">
                      {row.expense_date}
                    </td>
                    <td className="py-3 px-3 font-medium text-[#f2f2f0] light:text-[#1a1a18]">
                      {row.category_name}
                    </td>
                    <td className="py-3 px-3 text-[#a8a8a3] light:text-[#5a5a55]">
                      {row.description || '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-[#e0655a] whitespace-nowrap">
                      ₹{Number(row.amount).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[#a8a8a3]">
                    No expense records available to export.
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
