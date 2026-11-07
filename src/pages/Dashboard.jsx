import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler,
} from 'chart.js';
import { Pie, Line } from 'react-chartjs-2';
import { AlertTriangle, TrendingUp, TrendingDown, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler
);

export default function Dashboard({ onSummaryLoaded }) {
  const [data, setData] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isLight } = useTheme();

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [summaryRes, chartRes] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/dashboard/charts'),
      ]);

      if (summaryRes.success) {
        setData(summaryRes.data);
        if (onSummaryLoaded) onSummaryLoaded(summaryRes.data);
      }
      if (chartRes.success) {
        setCharts(chartRes);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-10 h-10 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
        <span className="text-xs text-[#a8a8a3]">Calculating financial insights...</span>
      </div>
    );
  }

  const {
    budget = 0,
    incomeTotal = 0,
    expenseTotal = 0,
    netSavings = 0,
    remaining = 0,
    budgetExceeded = false,
    budgetPercent = 0,
    comparison = 0,
    topCategory = null,
    healthScore = 100,
    aiInsight = '',
    recentExpenses = [],
  } = data || {};

  const scoreColor =
    healthScore > 70 ? 'text-[#5cb98a]' : healthScore > 40 ? 'text-[#d4a84b]' : 'text-[#e0655a]';

  const legendColor = isLight ? '#5a5a55' : '#a8a8a3';
  const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';

  const pieChartData = {
    labels: charts?.categories || [],
    datasets: [
      {
        data: charts?.categoryAmounts || [],
        backgroundColor: ['#cc7a3e', '#6b9cf7', '#5cb98a', '#d4a84b', '#e0655a', '#8b6cf7', '#38d9c0'],
        borderWidth: 0,
        hoverOffset: 8,
      },
    ],
  };

  const lineChartData = {
    labels: charts?.months || [],
    datasets: [
      {
        label: 'Monthly Expense',
        data: charts?.monthlyAmounts || [],
        borderColor: '#cc7a3e',
        backgroundColor: 'rgba(204,122,62,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: '#cc7a3e',
        borderWidth: 2.5,
      },
    ],
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: { labels: { color: legendColor, font: { size: 12 } } },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: legendColor },
      },
      y: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: { color: legendColor },
      },
    },
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* BUDGET EXCEEDED BANNER */}
      {budgetExceeded && (
        <div className="p-4 rounded-2xl bg-[#e0655a]/15 border border-[#e0655a]/30 flex items-center gap-3 text-sm text-[#e0655a] font-medium shadow-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            ⚠️ You have exceeded your monthly budget of ₹{Number(budget).toLocaleString('en-IN')}!
          </span>
        </div>
      )}

      {/* SUMMARY STAT CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {/* Total Income */}
        <div className="p-4 md:p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55] font-medium block mb-2">
            Total Income
          </span>
          <h2 className="text-xl md:text-2xl font-bold font-display text-[#5cb98a]">
            ₹{Number(incomeTotal).toLocaleString('en-IN')}
          </h2>
        </div>

        {/* Total Expense */}
        <div className="p-4 md:p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55] font-medium block mb-2">
            Total Expense
          </span>
          <h2 className="text-xl md:text-2xl font-bold font-display text-[#e0655a]">
            ₹{Number(expenseTotal).toLocaleString('en-IN')}
          </h2>
        </div>

        {/* Net Savings */}
        <div className="p-4 md:p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55] font-medium block mb-2">
            Net Savings
          </span>
          <h2
            className={`text-xl md:text-2xl font-bold font-display ${
              netSavings >= 0 ? 'text-[#5cb98a]' : 'text-[#e0655a]'
            }`}
          >
            ₹{Number(netSavings).toLocaleString('en-IN')}
          </h2>
        </div>

        {/* Remaining Budget */}
        <div className="p-4 md:p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55] font-medium block mb-2">
            Remaining Budget
          </span>
          <h2
            className={`text-xl md:text-2xl font-bold font-display ${
              remaining > 0 ? 'text-[#5cb98a]' : 'text-[#e0655a]'
            }`}
          >
            ₹{Number(remaining).toLocaleString('en-IN')}
          </h2>
        </div>

        {/* Budget Limit */}
        <div className="col-span-2 md:col-span-1 p-4 md:p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55] font-medium block mb-2">
            Budget Limit
          </span>
          <h2 className="text-xl md:text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18]">
            ₹{Number(budget).toLocaleString('en-IN')}
          </h2>
        </div>
      </div>

      {/* BUDGET USAGE PROGRESS */}
      <div className="p-5 md:p-6 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
            Monthly Budget Usage — <span className="text-brand">{budgetPercent}%</span>
          </h3>
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55]">
            ₹{Number(expenseTotal).toLocaleString('en-IN')} of ₹{Number(budget).toLocaleString('en-IN')}
          </span>
        </div>
        <div className="w-full h-3 rounded-full bg-white/[0.06] light:bg-black/[0.06] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              budgetPercent >= 100
                ? 'bg-[#e0655a]'
                : budgetPercent >= 80
                ? 'bg-[#d4a84b]'
                : 'bg-brand'
            }`}
            style={{ width: `${Math.min(budgetPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* EXTRA METRICS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Month Comparison */}
        <div className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55] font-medium block">
            Month Comparison
          </span>
          <div className="mt-2 flex items-center gap-2">
            {comparison > 0 ? (
              <TrendingUp className="w-5 h-5 text-[#e0655a]" />
            ) : (
              <TrendingDown className="w-5 h-5 text-[#5cb98a]" />
            )}
            <p className="text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18]">
              {comparison > 0 ? '+' : ''}
              {comparison}%
            </p>
          </div>
          <p className="text-xs text-[#636360] light:text-[#9a9a93] mt-1">vs. last month spending</p>
        </div>

        {/* Top Spending Category */}
        <div className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55] font-medium block">
            Top Spending Category
          </span>
          <p className="text-xl font-bold font-display text-brand mt-2">
            {topCategory ? topCategory.name : 'No expenses yet'}
          </p>
          {topCategory && (
            <p className="text-xs text-[#636360] light:text-[#9a9a93] mt-1">
              ₹{Number(topCategory.total).toLocaleString('en-IN')} total spent
            </p>
          )}
        </div>

        {/* Financial Health Score */}
        <div className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55] font-medium block">
            Financial Health Score
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={`text-3xl font-display font-bold ${scoreColor}`}>
              {healthScore}
            </span>
            <span className="text-xs text-[#a8a8a3] light:text-[#5a5a55]">/100</span>
          </div>
          <p className="text-xs text-[#636360] light:text-[#9a9a93] mt-1">
            {healthScore >= 80 ? 'Excellent financial discipline' : healthScore >= 50 ? 'Moderate spending balance' : 'Requires immediate attention'}
          </p>
        </div>
      </div>

      {/* AI INSIGHT */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-brand/15 to-transparent border border-brand/25 flex items-start gap-3.5 shadow-sm">
        <div className="w-8 h-8 rounded-xl bg-brand/20 flex items-center justify-center shrink-0 text-brand">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-brand mb-1">
            Finlytics AI Financial Insight
          </h4>
          <p className="text-xs md:text-sm text-[#f2f2f0] light:text-[#1a1a18] leading-relaxed">
            {aiInsight}
          </p>
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="p-5 md:p-6 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18] mb-4">
            Expense Distribution
          </h3>
          <div className="h-64 flex items-center justify-center">
            {charts?.categories?.length > 0 ? (
              <Pie
                data={pieChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: { color: legendColor, boxWidth: 12, font: { size: 11 } },
                    },
                  },
                }}
              />
            ) : (
              <p className="text-xs text-[#a8a8a3]">No categorized expense data available.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 p-5 md:p-6 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
          <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18] mb-4">
            Monthly Spending Trend
          </h3>
          <div className="h-64">
            {charts?.months?.length > 0 ? (
              <Line data={lineChartData} options={lineChartOptions} />
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-[#a8a8a3]">No monthly trends recorded yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RECENT TRANSACTIONS */}
      <div className="p-5 md:p-6 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] shadow-card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
            Recent Transactions
          </h3>
          <Link
            to="/expenses"
            className="text-xs text-brand font-medium hover:underline flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
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
              {recentExpenses.length > 0 ? (
                recentExpenses.map((tx) => (
                  <tr key={tx.expense_id} className="hover:bg-white/[0.02] light:hover:bg-black/[0.02]">
                    <td className="py-3 px-3 text-[#a8a8a3] light:text-[#5a5a55] whitespace-nowrap">
                      {tx.expense_date}
                    </td>
                    <td className="py-3 px-3 font-medium text-[#f2f2f0] light:text-[#1a1a18]">
                      {tx.category_name}
                    </td>
                    <td className="py-3 px-3 text-[#a8a8a3] light:text-[#5a5a55]">
                      {tx.description || '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-[#e0655a] whitespace-nowrap">
                      ₹{Number(tx.amount).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[#a8a8a3] light:text-[#5a5a55]">
                    No recent transactions found. Add an expense or income to get started.
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
