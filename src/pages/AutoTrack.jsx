import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock3,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  Search,
  CheckCheck,
  ShieldCheck,
  Sliders,
  Sparkles,
  Zap,
  Info,
  ChevronRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

const formatINR = (val) =>
  `₹${Number(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateLabel = (val) => {
  if (!val) return '—';
  const str = String(val).slice(0, 10);
  const parts = str.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
};

export default function AutoTrack() {
  const navigate = useNavigate();

  // Page Data
  const [summary, setSummary] = useState({
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    duplicateCount: 0,
    totalImportedAmount: 0,
  });
  const [events, setEvents] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [incomeCategories, setIncomeCategories] = useState([]);

  // UI state
  const [activeTab, setActiveTab] = useState('approved'); // default to 'approved' (imported) to see statement items
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventIds, setSelectedEventIds] = useState(new Set());
  const [eventCategories, setEventCategories] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState({ type: '', text: '' });

  // Import Result Modal State
  const [importResult, setImportResult] = useState(null);

  // Manual Mapping Fallback Modal State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualStep, setManualStep] = useState(1);
  const [manualCsvText, setManualCsvText] = useState('');
  const [manualInspectData, setManualInspectData] = useState(null);
  const [manualCustomMapping, setManualCustomMapping] = useState({});
  const [manualPreviewData, setManualPreviewData] = useState(null);

  // Load initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, evRes, expRes, incRes] = await Promise.all([
        api.get('/autotrack/summary'),
        api.get(`/autotrack/events${activeTab === 'all' ? '' : `?status=${activeTab}`}`),
        api.get('/categories?type=expense'),
        api.get('/categories?type=income'),
      ]);

      if (sumRes.success) setSummary(sumRes.summary);
      if (evRes.success) setEvents(evRes.events || []);
      if (expRes.success) setExpenseCategories(expRes.categories || []);
      if (incRes.success) setIncomeCategories(incRes.categories || []);
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Failed to load AutoTrack data.' });
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase().trim();
    return events.filter(
      (ev) =>
        (ev.merchant && ev.merchant.toLowerCase().includes(q)) ||
        (ev.reference && ev.reference.toLowerCase().includes(q)) ||
        (ev.review_note && ev.review_note.toLowerCase().includes(q)) ||
        (ev.amount && String(ev.amount).includes(q))
    );
  }, [events, searchQuery]);

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedEventIds.size === filteredEvents.length) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(filteredEvents.map((e) => e.event_id)));
    }
  };

  const toggleSelectOne = (id) => {
    const next = new Set(selectedEventIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEventIds(next);
  };

  // ONE-CLICK AUTOMATED CSV IMPORT
  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setNotification({ type: 'error', text: 'Please upload a valid CSV file (.csv).' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotification({ type: 'error', text: 'Statement file size must be under 10MB.' });
      return;
    }

    setUploading(true);
    setNotification({ type: '', text: '' });

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvContent = e.target.result;
      try {
        const res = await api.post('/autotrack/csv/auto-import', { csvText: csvContent });

        if (!res.isRecognized) {
          // If unrecognized format, switch to manual column mapping modal
          setManualCsvText(csvContent);
          setManualInspectData(res);
          setManualCustomMapping(res.suggestedMapping || {});
          setManualStep(2);
          setShowManualModal(true);
          setNotification({
            type: 'info',
            text: 'Custom CSV layout detected. Please confirm column mapping.',
          });
        } else {
          // Automated import succeeded!
          setImportResult(res);
          setActiveTab('approved');
          await loadData();
        }
      } catch (err) {
        setNotification({ type: 'error', text: err.message || 'Failed to process statement.' });
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  };

  // Manual Mapping Workflow Handlers
  const handleManualPreview = async () => {
    setBusy(true);
    try {
      const res = await api.post('/autotrack/csv/preview', {
        csvText: manualCsvText,
        mapping: manualCustomMapping,
      });
      if (res.success) {
        setManualPreviewData(res);
        setManualStep(3);
      }
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Failed to preview.' });
    } finally {
      setBusy(false);
    }
  };

  const handleManualExecuteImport = async () => {
    if (!manualPreviewData?.validRows?.length) return;
    setBusy(true);
    try {
      const res = await api.post('/autotrack/csv/auto-import', {
        csvText: manualCsvText,
        mapping: manualCustomMapping,
      });
      setShowManualModal(false);
      setImportResult(res);
      setActiveTab('approved');
      await loadData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Import failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-brand">
            <Zap className="w-4 h-4 fill-brand/20" />
            <span className="text-[11px] uppercase tracking-[0.18em] font-bold">Automated AutoTrack</span>
          </div>
          <h1 className="text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18] mt-1">
            One-Click UPI & Bank Statement Import
          </h1>
          <p className="text-xs text-[#a8a8a3] light:text-[#5a5a55] mt-1">
            Upload statement CSV files downloaded from UPI apps (GPay, PhonePe, Paytm, BHIM) or bank portals. Transactions are automatically categorized and updated instantly.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setManualStep(1);
              setShowManualModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] light:bg-black/[0.05] hover:bg-white/[0.1] text-xs text-[#a8a8a3] hover:text-[#f2f2f0] transition-colors"
          >
            <Sliders className="w-3.5 h-3.5" /> Manual Mapping
          </button>
          <button
            onClick={loadData}
            disabled={loading || uploading || busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] light:bg-black/[0.05] hover:bg-white/[0.1] text-xs text-[#f2f2f0] light:text-[#1a1a18] transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global Notification Banner */}
      {notification.text && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl text-xs ${
            notification.type === 'error'
              ? 'border border-[#e0655a]/30 bg-[#e0655a]/10 text-[#e0655a]'
              : notification.type === 'info'
              ? 'border border-brand/30 bg-brand/10 text-brand'
              : 'border border-[#5cb98a]/30 bg-[#5cb98a]/10 text-[#5cb98a]'
          }`}
        >
          <span>{notification.text}</span>
          <button
            onClick={() => setNotification({ type: '', text: '' })}
            className="text-[10px] underline ml-3 opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* HERO AUTOMATED DRAG-AND-DROP UPLOAD ZONE */}
      <section className="relative overflow-hidden rounded-2xl border-2 border-dashed border-brand/40 bg-gradient-to-b from-brand/[0.06] to-transparent p-6 sm:p-8 text-center transition-all hover:border-brand/70">
        <input
          id="heroCsvInput"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
          }}
        />

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (uploading) return;
            if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
          }}
          className="cursor-pointer space-y-3"
          onClick={() => document.getElementById('heroCsvInput')?.click()}
        >
          <div className="w-14 h-14 rounded-2xl bg-brand/15 text-brand flex items-center justify-center mx-auto shadow-inner">
            {uploading ? (
              <RefreshCw className="w-7 h-7 animate-spin" />
            ) : (
              <UploadCloud className="w-7 h-7" />
            )}
          </div>

          <div>
            <h3 className="text-base font-bold text-[#f2f2f0] light:text-[#1a1a18]">
              {uploading
                ? 'Analyzing format & importing transactions...'
                : 'Drop statement CSV here or click to upload'}
            </h3>
            <p className="text-xs text-[#a8a8a3] mt-1 max-w-lg mx-auto">
              Automated detection for <strong>BHIM / UPI exports</strong>, <strong>Google Pay</strong>, <strong>PhonePe</strong>, <strong>Paytm</strong>, and major bank statements.
            </p>
          </div>

          {/* Supported Format Tags */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] text-[#a8a8a3]">
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] light:bg-black/[0.05] border border-white/[0.08] light:border-black/[0.08] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-brand" /> Auto-Format Detection
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] light:bg-black/[0.05] border border-white/[0.08] light:border-black/[0.08] flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-[#5cb98a]" /> Zero Duplicates (SHA-256)
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white/[0.05] light:bg-black/[0.05] border border-white/[0.08] light:border-black/[0.08] flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-brand" /> Auto-Classify DR/CR
            </span>
          </div>
        </div>
      </section>

      {/* SUMMARY KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[#a8a8a3] light:text-[#6a6a65]">Imported Records</span>
            <span className="p-1.5 rounded-lg bg-[#5cb98a]/15 text-[#5cb98a]">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-display text-[#5cb98a]">
            {summary.approvedCount}
          </div>
          <span className="text-[10px] text-[#888] light:text-[#777]">
            {formatINR(summary.totalImportedAmount)} total
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[#a8a8a3] light:text-[#6a6a65]">Duplicates Blocked</span>
            <span className="p-1.5 rounded-lg bg-white/10 light:bg-black/10 text-[#a8a8a3]">
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18]">
            {summary.duplicateCount}
          </div>
          <span className="text-[10px] text-[#888] light:text-[#777]">Prevented double entry</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[#a8a8a3] light:text-[#6a6a65]">Non-Successful Skipped</span>
            <span className="p-1.5 rounded-lg bg-[#e0655a]/15 text-[#e0655a]">
              <XCircle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-display text-[#e0655a]">
            {summary.rejectedCount}
          </div>
          <span className="text-[10px] text-[#888] light:text-[#777]">Failed status skipped</span>
        </div>

        <div className="p-4 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[#a8a8a3] light:text-[#6a6a65]">Pending Review</span>
            <span className="p-1.5 rounded-lg bg-brand/15 text-brand">
              <Clock3 className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18]">
            {summary.pendingCount}
          </div>
          <span className="text-[10px] text-[#888] light:text-[#777]">Manual review queue</span>
        </div>
      </div>

      {/* POST-IMPORT SUCCESS MODAL / SUMMARY CARD */}
      {importResult && (
        <div className="p-5 rounded-2xl border border-[#5cb98a]/30 bg-gradient-to-b from-[#5cb98a]/10 to-transparent space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#5cb98a]/20 text-[#5cb98a] flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#f2f2f0] light:text-[#1a1a18]">
                  Statement Import Complete!
                </h3>
                <p className="text-xs text-[#a8a8a3]">
                  Format: <span className="text-[#5cb98a] font-semibold">{importResult.formatDetected}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-3 py-1.5 rounded-xl bg-[#5cb98a] hover:bg-[#4ea87a] text-white text-xs font-semibold flex items-center gap-1 shadow-sm"
              >
                Go to Dashboard <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setImportResult(null)}
                className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-[#a8a8a3]"
              >
                Close
              </button>
            </div>
          </div>

          {/* Stats Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-xl bg-black/20 light:bg-black/[0.04]">
              <div className="text-lg font-bold text-[#5cb98a]">{importResult.importedCount}</div>
              <div className="text-[10px] text-[#a8a8a3]">Transactions Imported</div>
            </div>
            <div className="p-3 rounded-xl bg-black/20 light:bg-black/[0.04]">
              <div className="text-lg font-bold text-amber-500">{importResult.duplicateCount}</div>
              <div className="text-[10px] text-[#a8a8a3]">Duplicates Skipped</div>
            </div>
            <div className="p-3 rounded-xl bg-black/20 light:bg-black/[0.04]">
              <div className="text-lg font-bold text-[#e0655a]">{importResult.failedCount}</div>
              <div className="text-[10px] text-[#a8a8a3]">Failed Status Skipped</div>
            </div>
            <div className="p-3 rounded-xl bg-black/20 light:bg-black/[0.04]">
              <div className="text-lg font-bold text-[#f2f2f0] light:text-[#1a1a18]">{importResult.totalRows}</div>
              <div className="text-[10px] text-[#a8a8a3]">Total Rows Processed</div>
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-3.5 rounded-xl bg-black/30 light:bg-black/[0.05] text-xs gap-3">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-[#e0655a]/15 text-[#e0655a]"><TrendingUp className="w-3.5 h-3.5" /></span>
              <span>Added to Expenses: <strong className="text-[#e0655a]">{formatINR(importResult.totalExpenseAmount)}</strong> ({importResult.importedExpensesCount} items)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-[#5cb98a]/15 text-[#5cb98a]"><TrendingDown className="w-3.5 h-3.5" /></span>
              <span>Added to Income: <strong className="text-[#5cb98a]">{formatINR(importResult.totalIncomeAmount)}</strong> ({importResult.importedIncomeCount} items)</span>
            </div>
          </div>

          {/* Category Chips */}
          {importResult.categoryBreakdown && Object.keys(importResult.categoryBreakdown).length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-[#a8a8a3]">Categories Automatically Assigned:</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(importResult.categoryBreakdown).map(([cat, count]) => (
                  <span key={cat} className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.05] text-[#f2f2f0] border border-white/[0.08]">
                    {cat}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TRANSACTION LEDGER & REVIEW SECTION */}
      <section className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] space-y-4">
        {/* Tab Filters and Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/[0.07] light:border-black/[0.07] pb-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'approved', label: 'Imported Records', count: summary.approvedCount },
              { id: 'duplicate', label: 'Duplicates Prevented', count: summary.duplicateCount },
              { id: 'rejected', label: 'Failed Status Skipped', count: summary.rejectedCount },
              { id: 'pending', label: 'Pending Review', count: summary.pendingCount },
              { id: 'all', label: 'All Entries', count: null },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedEventIds(new Set());
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-[#a8a8a3] hover:text-[#f2f2f0] light:hover:text-black hover:bg-white/[0.05] light:hover:bg-black/[0.05]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      activeTab === tab.id ? 'bg-black/20 text-white' : 'bg-white/10 light:bg-black/10'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#777]" />
              <input
                type="text"
                placeholder="Search merchant, ref, party..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.04] light:bg-black/[0.04] text-xs text-[#f2f2f0] light:text-[#1a1a18] border border-white/[0.08] light:border-black/[0.08] focus:outline-none focus:border-brand"
              />
            </div>
          </div>
        </div>

        {/* Transactions Table / List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-xs text-[#a8a8a3]">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading records...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] light:bg-black/[0.04] text-[#a8a8a3] flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-6 h-6 text-brand" />
            </div>
            <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
              {activeTab === 'approved'
                ? 'No imported transactions yet'
                : `No ${activeTab} records found`}
            </h3>
            <p className="text-xs text-[#a8a8a3] max-w-md mx-auto leading-relaxed">
              Drag and drop a transaction statement CSV from Google Pay, PhonePe, Paytm, BHIM, or your bank into the upload zone above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredEvents.map((event) => {
              const isDebit = event.direction === 'debit';

              return (
                <div
                  key={event.event_id}
                  className="p-3.5 rounded-xl border bg-white/[0.02] light:bg-black/[0.02] border-white/[0.06] light:border-black/[0.06] transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center ${
                          isDebit
                            ? 'bg-[#e0655a]/15 text-[#e0655a]'
                            : 'bg-[#5cb98a]/15 text-[#5cb98a]'
                        }`}
                      >
                        {isDebit ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold text-[#f2f2f0] light:text-[#1a1a18] truncate max-w-xs sm:max-w-md">
                            {event.merchant || 'UPI Transaction'}
                          </p>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium uppercase tracking-wider ${
                              isDebit
                                ? 'bg-[#e0655a]/10 text-[#e0655a]'
                                : 'bg-[#5cb98a]/10 text-[#5cb98a]'
                            }`}
                          >
                            {event.direction}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.06] light:bg-black/[0.06] text-[#a8a8a3]">
                            {event.source_app === 'csv_statement' ? 'Statement CSV' : event.source_app}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-[11px] text-[#a8a8a3] flex-wrap">
                          <span>{dateLabel(event.transaction_date)}</span>
                          {event.reference && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-[10px] bg-black/20 light:bg-black/5 px-1 rounded">
                                Ref: {event.reference}
                              </span>
                            </>
                          )}
                          {event.review_note && (
                            <>
                              <span>·</span>
                              <span className="italic text-[#888]">{event.review_note}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-white/[0.05]">
                      <div
                        className={`text-sm font-bold font-display ${
                          isDebit ? 'text-[#e0655a]' : 'text-[#5cb98a]'
                        }`}
                      >
                        {isDebit ? '-' : '+'}
                        {formatINR(event.amount)}
                      </div>
                      <div className="text-[10px] text-[#777]">
                        Status: <span className="capitalize">{event.status}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MANUAL COLUMN MAPPING MODAL (FALLBACK FOR UNRECOGNIZED FORMATS) */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#161618] light:bg-white border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
                  Custom Column Mapping Fallback
                </h3>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-[#a8a8a3] hover:text-[#f2f2f0]"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {manualStep === 1 && (
                <div
                  onClick={() => document.getElementById('manualFileInput')?.click()}
                  className="border-2 border-dashed border-white/[0.15] p-8 text-center rounded-2xl cursor-pointer hover:border-brand/50"
                >
                  <input
                    id="manualFileInput"
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                    }}
                  />
                  <UploadCloud className="w-10 h-10 text-brand mx-auto mb-2" />
                  <p className="text-xs font-semibold text-[#f2f2f0]">Upload custom CSV statement</p>
                </div>
              )}

              {manualStep === 2 && manualInspectData && (
                <div className="space-y-4">
                  <p className="text-xs text-[#a8a8a3]">
                    Assign columns to match your custom bank format:
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-[#a8a8a3] mb-1">Date Column *</label>
                      <select
                        value={manualCustomMapping.dateCol ?? -1}
                        onChange={(e) =>
                          setManualCustomMapping((prev) => ({ ...prev, dateCol: Number(e.target.value) }))
                        }
                        className="w-full p-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-[#f2f2f0]"
                      >
                        <option value={-1}>-- Select Date Column --</option>
                        {manualInspectData.headers?.map((h, idx) => (
                          <option key={idx} value={idx}>{h || `Col ${idx + 1}`}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#a8a8a3] mb-1">Description / Receiver *</label>
                      <select
                        value={manualCustomMapping.descCol ?? -1}
                        onChange={(e) =>
                          setManualCustomMapping((prev) => ({ ...prev, descCol: Number(e.target.value) }))
                        }
                        className="w-full p-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-[#f2f2f0]"
                      >
                        <option value={-1}>-- Select Description Column --</option>
                        {manualInspectData.headers?.map((h, idx) => (
                          <option key={idx} value={idx}>{h || `Col ${idx + 1}`}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#a8a8a3] mb-1">Debit / Withdrawal</label>
                      <select
                        value={manualCustomMapping.debitCol ?? -1}
                        onChange={(e) =>
                          setManualCustomMapping((prev) => ({ ...prev, debitCol: Number(e.target.value) }))
                        }
                        className="w-full p-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-[#f2f2f0]"
                      >
                        <option value={-1}>None / Single Amount Column</option>
                        {manualInspectData.headers?.map((h, idx) => (
                          <option key={idx} value={idx}>{h || `Col ${idx + 1}`}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#a8a8a3] mb-1">Credit / Deposit</label>
                      <select
                        value={manualCustomMapping.creditCol ?? -1}
                        onChange={(e) =>
                          setManualCustomMapping((prev) => ({ ...prev, creditCol: Number(e.target.value) }))
                        }
                        className="w-full p-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-[#f2f2f0]"
                      >
                        <option value={-1}>None / Single Amount Column</option>
                        {manualInspectData.headers?.map((h, idx) => (
                          <option key={idx} value={idx}>{h || `Col ${idx + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {manualStep === 3 && manualPreviewData && (
                <div className="space-y-3 text-xs">
                  <div className="text-sm font-bold text-[#5cb98a]">
                    Ready to import {manualPreviewData.validCount} transactions ({manualPreviewData.duplicateCount} duplicates skipped).
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/[0.08] flex items-center justify-between">
              <button
                onClick={() => setShowManualModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs text-[#a8a8a3]"
              >
                Cancel
              </button>

              {manualStep === 2 && (
                <button
                  disabled={busy}
                  onClick={handleManualPreview}
                  className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold"
                >
                  Continue to Preview
                </button>
              )}

              {manualStep === 3 && (
                <button
                  disabled={busy}
                  onClick={handleManualExecuteImport}
                  className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold"
                >
                  Confirm & Import
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
