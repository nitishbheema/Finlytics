import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import {
  Activity,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock3,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Copy,
  Unplug,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Search,
  CheckCheck,
  ShieldCheck,
  Sliders,
  Smartphone,
  Info,
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
  const [settings, setSettings] = useState({ auto_import_enabled: false, require_reference: true });
  const [devices, setDevices] = useState([]);

  // UI state
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'approved' | 'duplicate' | 'rejected' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventIds, setSelectedEventIds] = useState(new Set());
  const [eventCategories, setEventCategories] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState({ type: '', text: '' });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pairingCode, setPairingCode] = useState('');

  // CSV Import Modal & Wizard State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState(1); // 1: Upload, 2: Mapping, 3: Preview
  const [csvFile, setCsvFile] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [inspectData, setInspectData] = useState(null);
  const [customMapping, setCustomMapping] = useState({});
  const [previewData, setPreviewData] = useState(null);
  const [importMode, setImportMode] = useState('review_queue'); // 'review_queue' | 'direct'
  const [defaultExpenseCat, setDefaultExpenseCat] = useState('');
  const [defaultIncomeCat, setDefaultIncomeCat] = useState('');
  const [showInvalidDetails, setShowInvalidDetails] = useState(false);

  // Load all initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, evRes, setRes, expRes, incRes, devRes] = await Promise.all([
        api.get('/autotrack/summary'),
        api.get(`/autotrack/events${activeTab === 'all' ? '' : `?status=${activeTab}`}`),
        api.get('/autotrack/settings'),
        api.get('/categories?type=expense'),
        api.get('/categories?type=income'),
        api.get('/autotrack/devices'),
      ]);

      if (sumRes.success) setSummary(sumRes.summary);
      if (evRes.success) setEvents(evRes.events || []);
      if (setRes.success) setSettings(setRes.settings || { auto_import_enabled: false, require_reference: true });
      if (expRes.success) setExpenseCategories(expRes.categories || []);
      if (incRes.success) setIncomeCategories(incRes.categories || []);
      if (devRes.success) setDevices(devRes.devices || []);
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

  // Actions
  const handleApprove = async (event) => {
    setBusy(true);
    try {
      const cats = event.direction === 'debit' ? expenseCategories : incomeCategories;
      const chosenCatId =
        eventCategories[event.event_id] ||
        cats.find((c) =>
          c.category_name.toLowerCase().includes(event.direction === 'debit' ? 'other expense' : 'other income')
        )?.category_id ||
        null;

      const res = await api.post(`/autotrack/events/${event.event_id}/approve`, {
        categoryId: chosenCatId,
      });

      if (res.duplicate) {
        setNotification({
          type: 'info',
          text: 'This transaction was detected as a duplicate and marked accordingly.',
        });
      } else {
        setNotification({
          type: 'success',
          text: `Transaction imported into your ${res.importedInto === 'expense' ? 'Expenses' : 'Income'}!`,
        });
      }
      await loadData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Failed to approve transaction.' });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (event) => {
    setBusy(true);
    try {
      await api.post(`/autotrack/events/${event.event_id}/reject`, {});
      setNotification({ type: 'success', text: 'Transaction dismissed.' });
      await loadData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Failed to dismiss transaction.' });
    } finally {
      setBusy(false);
    }
  };

  const handleBulkApprove = async (allPending = false) => {
    const count = allPending ? summary.pendingCount : selectedEventIds.size;
    if (count === 0) return;
    if (!window.confirm(`Approve and import ${count} transaction(s) into your records?`)) return;

    setBusy(true);
    try {
      const payload = allPending
        ? { allPending: true }
        : { eventIds: Array.from(selectedEventIds) };

      const res = await api.post('/autotrack/events/bulk-approve', payload);
      setNotification({
        type: 'success',
        text: res.message || `Imported ${res.approvedCount} transactions into records.`,
      });
      setSelectedEventIds(new Set());
      await loadData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Bulk approval failed.' });
    } finally {
      setBusy(false);
    }
  };

  const handleBulkReject = async (allPending = false) => {
    const count = allPending ? summary.pendingCount : selectedEventIds.size;
    if (count === 0) return;
    if (!window.confirm(`Dismiss ${count} transaction(s)?`)) return;

    setBusy(true);
    try {
      const payload = allPending
        ? { allPending: true }
        : { eventIds: Array.from(selectedEventIds) };

      const res = await api.post('/autotrack/events/bulk-reject', payload);
      setNotification({
        type: 'success',
        text: res.message || `Dismissed ${res.rejectedCount} transactions.`,
      });
      setSelectedEventIds(new Set());
      await loadData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Bulk dismissal failed.' });
    } finally {
      setBusy(false);
    }
  };

  // CSV Import Wizard Handlers
  const handleFileSelect = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setNotification({ type: 'error', text: 'Please upload a valid CSV file (.csv).' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotification({ type: 'error', text: 'Statement file size must be under 5MB.' });
      return;
    }

    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      setCsvText(content);
      await inspectUploadedCSV(content);
    };
    reader.readAsText(file);
  };

  const inspectUploadedCSV = async (text) => {
    setBusy(true);
    try {
      const res = await api.post('/autotrack/csv/inspect', { csvText: text });
      if (res.success) {
        setInspectData(res);
        setCustomMapping(res.suggestedMapping || {});
        setImportStep(2); // Go to Column Mapping step
      }
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Failed to analyze CSV statement.' });
    } finally {
      setBusy(false);
    }
  };

  const handleGeneratePreview = async () => {
    setBusy(true);
    try {
      const res = await api.post('/autotrack/csv/preview', {
        csvText,
        mapping: customMapping,
      });
      if (res.success) {
        setPreviewData(res);
        setImportStep(3); // Go to Preview step
      }
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Failed to preview statement transactions.' });
    } finally {
      setBusy(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!previewData || !previewData.validRows || previewData.validRows.length === 0) {
      setNotification({ type: 'error', text: 'No valid transactions found to import.' });
      return;
    }

    setBusy(true);
    try {
      const res = await api.post('/autotrack/csv/import', {
        transactions: previewData.validRows,
        importMode,
        defaultExpenseCategoryId: defaultExpenseCat || null,
        defaultIncomeCategoryId: defaultIncomeCat || null,
      });

      setNotification({
        type: 'success',
        text: res.message || 'Bank statement successfully processed!',
      });

      // Close modal and refresh
      setShowImportModal(false);
      resetImportWizard();
      await loadData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Failed to import transactions.' });
    } finally {
      setBusy(false);
    }
  };

  const resetImportWizard = () => {
    setImportStep(1);
    setCsvFile(null);
    setCsvText('');
    setInspectData(null);
    setCustomMapping({});
    setPreviewData(null);
    setShowInvalidDetails(false);
  };

  // Companion & Settings Handlers
  const toggleAutoImportSetting = async (enabled) => {
    setBusy(true);
    try {
      const res = await api.put('/autotrack/settings', {
        autoImportEnabled: enabled,
        requireReference: true,
      });
      setSettings(res.settings);
      setNotification({
        type: 'success',
        text: enabled
          ? 'Auto-import enabled for verified transactions with bank reference.'
          : 'Auto-import disabled. All statement rows will queue for manual review.',
      });
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Could not update settings.' });
    } finally {
      setBusy(false);
    }
  };

  const createPairingCode = async () => {
    setBusy(true);
    try {
      const res = await api.post('/autotrack/pairing-codes', {});
      setPairingCode(res.pairingCode);
      setNotification({
        type: 'info',
        text: 'Pairing code generated (expires in 10 minutes, single use).',
      });
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Could not generate code.' });
    } finally {
      setBusy(false);
    }
  };

  const disconnectDevice = async (deviceId) => {
    if (!window.confirm('Disconnect this device?')) return;
    setBusy(true);
    try {
      await api.delete(`/autotrack/devices/${deviceId}`);
      setNotification({ type: 'success', text: 'Device disconnected.' });
      await loadData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Failed to disconnect.' });
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
            <Activity className="w-4 h-4" />
            <span className="text-[11px] uppercase tracking-[0.18em] font-bold">Finlytics AutoTrack</span>
          </div>
          <h1 className="text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18] mt-1">
            Bank Statement Import & Review
          </h1>
          <p className="text-xs text-[#a8a8a3] light:text-[#5a5a55] mt-1">
            Upload bank CSV statements, review categorized transactions with duplicate protection, and maintain your records.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              resetImportWizard();
              setShowImportModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand hover:bg-[#b56832] text-white text-xs font-semibold shadow-md transition-colors"
          >
            <UploadCloud className="w-4 h-4" /> Import CSV Statement
          </button>
          <button
            onClick={loadData}
            disabled={loading || busy}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/[0.05] light:bg-black/[0.05] hover:bg-white/[0.1] text-xs text-[#f2f2f0] light:text-[#1a1a18] transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Transparent Disclaimer Banner */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl border border-white/[0.08] light:border-black/[0.08] bg-white/[0.02] light:bg-black/[0.02]">
        <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
        <p className="text-[11px] text-[#a8a8a3] light:text-[#5a5a55] leading-relaxed">
          <strong className="text-[#f2f2f0] light:text-[#1a1a18]">Statement-Based Tracking:</strong>{' '}
          All transaction imports are user-initiated via bank CSV files with local parsing and duplicate SHA-256 fingerprinting. Push notification tracking is deferred for a future mobile companion.
        </p>
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
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
          <span className="text-[10px] text-[#888] light:text-[#777]">Waiting for approval</span>
        </div>

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
            {formatINR(summary.totalImportedAmount)} added
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
            <span className="text-[11px] font-medium text-[#a8a8a3] light:text-[#6a6a65]">Dismissed</span>
            <span className="p-1.5 rounded-lg bg-[#e0655a]/15 text-[#e0655a]">
              <XCircle className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-display text-[#e0655a]">
            {summary.rejectedCount}
          </div>
          <span className="text-[10px] text-[#888] light:text-[#777]">Ignored by user</span>
        </div>
      </div>

      {/* Main Review Queue Section */}
      <section className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] space-y-4">
        {/* Tab Filters and Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/[0.07] light:border-black/[0.07] pb-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'pending', label: 'Pending Review', count: summary.pendingCount },
              { id: 'approved', label: 'Imported', count: summary.approvedCount },
              { id: 'duplicate', label: 'Duplicates', count: summary.duplicateCount },
              { id: 'rejected', label: 'Dismissed', count: summary.rejectedCount },
              { id: 'all', label: 'All Records', count: null },
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
                placeholder="Search merchant or ref..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.04] light:bg-black/[0.04] text-xs text-[#f2f2f0] light:text-[#1a1a18] border border-white/[0.08] light:border-black/[0.08] focus:outline-none focus:border-brand"
              />
            </div>
          </div>
        </div>

        {/* Bulk Action Bar (Visible when in Pending tab and rows exist) */}
        {activeTab === 'pending' && filteredEvents.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] light:bg-black/[0.03] border border-white/[0.05] light:border-black/[0.05]">
            <div className="flex items-center gap-2.5">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[#a8a8a3]">
                <input
                  type="checkbox"
                  checked={
                    filteredEvents.length > 0 && selectedEventIds.size === filteredEvents.length
                  }
                  onChange={toggleSelectAll}
                  className="rounded accent-brand"
                />
                <span>Select All ({filteredEvents.length})</span>
              </label>
              {selectedEventIds.size > 0 && (
                <span className="text-[11px] text-brand font-semibold">
                  {selectedEventIds.size} selected
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedEventIds.size > 0 ? (
                <>
                  <button
                    disabled={busy}
                    onClick={() => handleBulkApprove(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5cb98a]/15 text-[#5cb98a] hover:bg-[#5cb98a]/25 text-xs font-semibold transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Approve Selected
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleBulkReject(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#e0655a]/10 text-[#e0655a] hover:bg-[#e0655a]/20 text-xs transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Dismiss Selected
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled={busy}
                    onClick={() => handleBulkApprove(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] light:bg-black/[0.05] hover:bg-white/[0.1] text-xs text-[#a8a8a3] hover:text-[#f2f2f0] transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Approve All ({summary.pendingCount})
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Transactions Table / List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-xs text-[#a8a8a3]">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading records...
          </div>
        ) : filteredEvents.length === 0 ? (
          /* Empty State */
          <div className="text-center py-12 px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] light:bg-black/[0.04] text-[#a8a8a3] flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-6 h-6 text-brand" />
            </div>
            <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
              {activeTab === 'pending'
                ? 'No transactions waiting for review'
                : `No ${activeTab} transactions found`}
            </h3>
            <p className="text-xs text-[#a8a8a3] max-w-md mx-auto leading-relaxed">
              Upload a bank CSV statement using the button above. The parser will extract transaction dates, descriptions, amounts, and UTR references while preventing duplicates.
            </p>
            {activeTab === 'pending' && (
              <button
                onClick={() => {
                  resetImportWizard();
                  setShowImportModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold shadow-sm hover:bg-[#b56832]"
              >
                <UploadCloud className="w-3.5 h-3.5" /> Upload Bank Statement
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredEvents.map((event) => {
              const isDebit = event.direction === 'debit';
              const cats = isDebit ? expenseCategories : incomeCategories;
              const selectedCatId = eventCategories[event.event_id] || '';
              const isChecked = selectedEventIds.has(event.event_id);

              return (
                <div
                  key={event.event_id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isChecked
                      ? 'bg-brand/[0.04] border-brand/40'
                      : 'bg-white/[0.02] light:bg-black/[0.02] border-white/[0.06] light:border-black/[0.06]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left details */}
                    <div className="flex items-start gap-3 min-w-0">
                      {activeTab === 'pending' && (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(event.event_id)}
                          className="mt-1 rounded accent-brand"
                        />
                      )}

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
                            {event.merchant || 'Bank Transaction'}
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
                            {event.source_app === 'csv_statement' ? 'Bank CSV' : event.source_app}
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

                    {/* Right Amount & Actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-white/[0.05]">
                      <div className="text-right">
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

                      {/* Approval / Rejection Controls for Pending items */}
                      {event.status === 'pending' && (
                        <div className="flex items-center gap-1.5">
                          <select
                            value={selectedCatId}
                            onChange={(e) =>
                              setEventCategories((prev) => ({
                                ...prev,
                                [event.event_id]: e.target.value,
                              }))
                            }
                            className="text-[11px] px-2 py-1.5 rounded-lg bg-white/[0.05] light:bg-black/[0.05] text-[#f2f2f0] light:text-[#1a1a18] border border-white/[0.08] light:border-black/[0.08] max-w-[130px]"
                          >
                            <option value="">Default Category</option>
                            {cats.map((c) => (
                              <option key={c.category_id} value={c.category_id}>
                                {c.category_name}
                              </option>
                            ))}
                          </select>

                          <button
                            disabled={busy}
                            onClick={() => handleApprove(event)}
                            className="p-1.5 rounded-lg bg-[#5cb98a]/15 text-[#5cb98a] hover:bg-[#5cb98a]/25 transition-colors"
                            title="Approve & Import"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>

                          <button
                            disabled={busy}
                            onClick={() => handleReject(event)}
                            className="p-1.5 rounded-lg bg-[#e0655a]/10 text-[#e0655a] hover:bg-[#e0655a]/20 transition-colors"
                            title="Dismiss Transaction"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* CSV Bank Statement Import Wizard Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#161618] light:bg-white border border-white/[0.1] light:border-black/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-white/[0.08] light:border-black/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand/15 text-brand flex items-center justify-center">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
                    Bank Statement CSV Importer
                  </h3>
                  <p className="text-[10px] text-[#a8a8a3]">
                    Step {importStep} of 3:{' '}
                    {importStep === 1
                      ? 'Upload File'
                      : importStep === 2
                      ? 'Confirm Column Mapping'
                      : 'Preview & Import'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-[#a8a8a3] hover:text-[#f2f2f0] p-1 rounded-lg hover:bg-white/[0.05]"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* STEP 1: Upload CSV */}
              {importStep === 1 && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
                    }}
                    className="border-2 border-dashed border-white/[0.15] light:border-black/[0.15] hover:border-brand/50 rounded-2xl p-8 text-center cursor-pointer transition-colors"
                    onClick={() => document.getElementById('csvFileInput')?.click()}
                  >
                    <input
                      id="csvFileInput"
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                      }}
                    />
                    <UploadCloud className="w-10 h-10 text-brand mx-auto mb-2" />
                    <p className="text-xs font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
                      Click or drag & drop your bank statement CSV file
                    </p>
                    <p className="text-[11px] text-[#888] mt-1">
                      Supports HDFC, SBI, ICICI, Axis, Kotak and standard bank CSV exports (max 5MB)
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.03] light:bg-black/[0.03] space-y-2 text-xs text-[#a8a8a3]">
                    <div className="font-semibold text-[#f2f2f0] light:text-[#1a1a18] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#5cb98a]" /> How Finlytics protects your statement data
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-[11px]">
                      <li>CSV parsing happens securely without storing raw file binaries.</li>
                      <li>Dates, amounts, and references are normalized into clean records.</li>
                      <li>Duplicate transactions are automatically detected via deterministic SHA-256 fingerprints.</li>
                      <li>Never upload files containing banking passwords or ATM PINs.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* STEP 2: Verify Column Mapping */}
              {importStep === 2 && inspectData && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-white/[0.03] text-xs text-[#a8a8a3]">
                    We analyzed <strong className="text-[#f2f2f0]">{inspectData.totalRawRows} rows</strong>. Confirm or adjust the column assignments below.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Date Column */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#a8a8a3] mb-1">
                        Date Column *
                      </label>
                      <select
                        value={customMapping.dateCol ?? -1}
                        onChange={(e) =>
                          setCustomMapping((prev) => ({
                            ...prev,
                            dateCol: Number(e.target.value),
                          }))
                        }
                        className="w-full text-xs p-2 rounded-xl bg-white/[0.05] light:bg-black/[0.05] border border-white/[0.1] text-[#f2f2f0] light:text-[#1a1a18]"
                      >
                        <option value={-1}>-- Select Date Column --</option>
                        {inspectData.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            Column {idx + 1}: {h || `(Empty #${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date Format */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#a8a8a3] mb-1">
                        Date Format
                      </label>
                      <select
                        value={customMapping.dateFormat || 'auto'}
                        onChange={(e) =>
                          setCustomMapping((prev) => ({
                            ...prev,
                            dateFormat: e.target.value,
                          }))
                        }
                        className="w-full text-xs p-2 rounded-xl bg-white/[0.05] light:bg-black/[0.05] border border-white/[0.1] text-[#f2f2f0] light:text-[#1a1a18]"
                      >
                        <option value="auto">Auto-detect (DD/MM/YYYY or YYYY-MM-DD)</option>
                        <option value="dmy">DD/MM/YYYY (Indian / UK standard)</option>
                        <option value="mdy">MM/DD/YYYY (US format)</option>
                      </select>
                    </div>

                    {/* Narration / Description */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#a8a8a3] mb-1">
                        Description / Narration Column *
                      </label>
                      <select
                        value={customMapping.descCol ?? -1}
                        onChange={(e) =>
                          setCustomMapping((prev) => ({
                            ...prev,
                            descCol: Number(e.target.value),
                          }))
                        }
                        className="w-full text-xs p-2 rounded-xl bg-white/[0.05] light:bg-black/[0.05] border border-white/[0.1] text-[#f2f2f0] light:text-[#1a1a18]"
                      >
                        <option value={-1}>-- Select Description Column --</option>
                        {inspectData.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            Column {idx + 1}: {h || `(Empty #${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Reference / UTR */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#a8a8a3] mb-1">
                        Reference / Chq / UTR Column (Optional)
                      </label>
                      <select
                        value={customMapping.refCol ?? -1}
                        onChange={(e) =>
                          setCustomMapping((prev) => ({
                            ...prev,
                            refCol: Number(e.target.value),
                          }))
                        }
                        className="w-full text-xs p-2 rounded-xl bg-white/[0.05] light:bg-black/[0.05] border border-white/[0.1] text-[#f2f2f0] light:text-[#1a1a18]"
                      >
                        <option value={-1}>None / Extract from description</option>
                        {inspectData.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            Column {idx + 1}: {h || `(Empty #${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Debit Column */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#a8a8a3] mb-1">
                        Debit / Withdrawal Column
                      </label>
                      <select
                        value={customMapping.debitCol ?? -1}
                        onChange={(e) =>
                          setCustomMapping((prev) => ({
                            ...prev,
                            debitCol: Number(e.target.value),
                          }))
                        }
                        className="w-full text-xs p-2 rounded-xl bg-white/[0.05] light:bg-black/[0.05] border border-white/[0.1] text-[#f2f2f0] light:text-[#1a1a18]"
                      >
                        <option value={-1}>None / Single Amount Column</option>
                        {inspectData.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            Column {idx + 1}: {h || `(Empty #${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Credit Column */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#a8a8a3] mb-1">
                        Credit / Deposit Column
                      </label>
                      <select
                        value={customMapping.creditCol ?? -1}
                        onChange={(e) =>
                          setCustomMapping((prev) => ({
                            ...prev,
                            creditCol: Number(e.target.value),
                          }))
                        }
                        className="w-full text-xs p-2 rounded-xl bg-white/[0.05] light:bg-black/[0.05] border border-white/[0.1] text-[#f2f2f0] light:text-[#1a1a18]"
                      >
                        <option value={-1}>None / Single Amount Column</option>
                        {inspectData.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            Column {idx + 1}: {h || `(Empty #${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Single Amount Column (Fallback) */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#a8a8a3] mb-1">
                        Single Amount Column (if no separate Debit/Credit)
                      </label>
                      <select
                        value={customMapping.amountCol ?? -1}
                        onChange={(e) =>
                          setCustomMapping((prev) => ({
                            ...prev,
                            amountCol: Number(e.target.value),
                          }))
                        }
                        className="w-full text-xs p-2 rounded-xl bg-white/[0.05] light:bg-black/[0.05] border border-white/[0.1] text-[#f2f2f0] light:text-[#1a1a18]"
                      >
                        <option value={-1}>Not applicable (separate Debit/Credit used)</option>
                        {inspectData.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            Column {idx + 1}: {h || `(Empty #${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Type Column (CR/DR) */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#a8a8a3] mb-1">
                        Type Column (CR / DR, optional)
                      </label>
                      <select
                        value={customMapping.typeCol ?? -1}
                        onChange={(e) =>
                          setCustomMapping((prev) => ({
                            ...prev,
                            typeCol: Number(e.target.value),
                          }))
                        }
                        className="w-full text-xs p-2 rounded-xl bg-white/[0.05] light:bg-black/[0.05] border border-white/[0.1] text-[#f2f2f0] light:text-[#1a1a18]"
                      >
                        <option value={-1}>Not applicable</option>
                        {inspectData.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            Column {idx + 1}: {h || `(Empty #${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Preview Parsed Transactions */}
              {importStep === 3 && previewData && (
                <div className="space-y-4">
                  {/* Validation stats */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-3 rounded-xl bg-[#5cb98a]/10 border border-[#5cb98a]/20">
                      <div className="text-lg font-bold text-[#5cb98a]">
                        {previewData.newCount}
                      </div>
                      <div className="text-[10px] text-[#a8a8a3]">New Transactions</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                      <div className="text-lg font-bold text-[#a8a8a3]">
                        {previewData.duplicateCount}
                      </div>
                      <div className="text-[10px] text-[#a8a8a3]">Duplicates (Skipped)</div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#e0655a]/10 border border-[#e0655a]/20">
                      <div className="text-lg font-bold text-[#e0655a]">
                        {previewData.invalidCount}
                      </div>
                      <div className="text-[10px] text-[#a8a8a3]">Invalid / Flagged</div>
                    </div>
                  </div>

                  {/* Flagged rows alert if any */}
                  {previewData.invalidCount > 0 && (
                    <div className="p-3 rounded-xl border border-[#e0655a]/25 bg-[#e0655a]/5 space-y-2">
                      <div className="flex items-center justify-between text-xs text-[#e0655a]">
                        <span className="flex items-center gap-1.5 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" /> {previewData.invalidCount} row(s) could not be parsed
                        </span>
                        <button
                          onClick={() => setShowInvalidDetails(!showInvalidDetails)}
                          className="text-[10px] underline hover:opacity-80"
                        >
                          {showInvalidDetails ? 'Hide details' : 'View explanations'}
                        </button>
                      </div>

                      {showInvalidDetails && (
                        <div className="space-y-1 max-h-36 overflow-y-auto pt-1 text-[11px] text-[#a8a8a3] divide-y divide-white/[0.05]">
                          {previewData.invalidRows.map((inv, idx) => (
                            <div key={idx} className="py-1">
                              <span className="text-[#e0655a] font-semibold">Row {inv.rowNumber}:</span>{' '}
                              {inv.reason}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Import Mode Options */}
                  <div className="p-3.5 rounded-xl bg-white/[0.03] space-y-3 border border-white/[0.06]">
                    <div className="text-xs font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
                      Choose Import Destination
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="importMode"
                          value="review_queue"
                          checked={importMode === 'review_queue'}
                          onChange={() => setImportMode('review_queue')}
                          className="mt-0.5 accent-brand"
                        />
                        <div>
                          <span className="text-xs font-medium text-[#f2f2f0] light:text-[#1a1a18]">
                            Add to AutoTrack Review Queue (Recommended)
                          </span>
                          <p className="text-[10px] text-[#888]">
                            Allows you to inspect each row and assign custom categories before committing to your records.
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="importMode"
                          value="direct"
                          checked={importMode === 'direct'}
                          onChange={() => setImportMode('direct')}
                          className="mt-0.5 accent-brand"
                        />
                        <div>
                          <span className="text-xs font-medium text-[#f2f2f0] light:text-[#1a1a18]">
                            Import Directly into Expenses & Income Records
                          </span>
                          <p className="text-[10px] text-[#888]">
                            Bypasses review and writes directly into your transactions database using selected fallback categories.
                          </p>
                        </div>
                      </label>
                    </div>

                    {importMode === 'direct' && (
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
                        <div>
                          <label className="block text-[10px] text-[#a8a8a3] mb-1">
                            Default Expense Category
                          </label>
                          <select
                            value={defaultExpenseCat}
                            onChange={(e) => setDefaultExpenseCat(e.target.value)}
                            className="w-full text-xs p-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-[#f2f2f0]"
                          >
                            <option value="">Other Expense (Default)</option>
                            {expenseCategories.map((c) => (
                              <option key={c.category_id} value={c.category_id}>
                                {c.category_name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-[#a8a8a3] mb-1">
                            Default Income Category
                          </label>
                          <select
                            value={defaultIncomeCat}
                            onChange={(e) => setDefaultIncomeCat(e.target.value)}
                            className="w-full text-xs p-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-[#f2f2f0]"
                          >
                            <option value="">Other Income (Default)</option>
                            {incomeCategories.map((c) => (
                              <option key={c.category_id} value={c.category_id}>
                                {c.category_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sample Preview Rows */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-[#f2f2f0]">
                      Transaction Sample (first 5 of {previewData.validRows.length})
                    </div>
                    <div className="divide-y divide-white/[0.05] border border-white/[0.08] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                      {previewData.validRows.slice(0, 5).map((row, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 flex items-center justify-between text-xs bg-white/[0.01]"
                        >
                          <div>
                            <div className="font-semibold text-[#f2f2f0]">{row.merchant}</div>
                            <div className="text-[10px] text-[#888]">
                              {row.transactionDate} {row.reference ? `· Ref: ${row.reference}` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className={`font-bold ${
                                row.direction === 'debit' ? 'text-[#e0655a]' : 'text-[#5cb98a]'
                              }`}
                            >
                              {row.direction === 'debit' ? '-' : '+'}
                              {formatINR(row.amount)}
                            </span>
                            {row.isDuplicate && (
                              <div className="text-[9px] text-amber-500 font-semibold">Duplicate</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-white/[0.08] light:border-black/[0.08] flex items-center justify-between">
              {importStep > 1 ? (
                <button
                  disabled={busy}
                  onClick={() => setImportStep(importStep - 1)}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs text-[#a8a8a3] hover:text-[#f2f2f0]"
                >
                  Back
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs text-[#a8a8a3] hover:text-[#f2f2f0]"
                >
                  Cancel
                </button>

                {importStep === 2 && (
                  <button
                    disabled={busy}
                    onClick={handleGeneratePreview}
                    className="px-4 py-2 rounded-xl bg-brand hover:bg-[#b56832] text-white text-xs font-semibold"
                  >
                    Continue to Preview
                  </button>
                )}

                {importStep === 3 && (
                  <button
                    disabled={busy || !previewData || previewData.validRows?.length === 0}
                    onClick={handleExecuteImport}
                    className="px-4 py-2 rounded-xl bg-brand hover:bg-[#b56832] text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                    Confirm & Process Import
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Advanced Section: Auto-Import Rules & Companion Devices */}
      <section className="rounded-2xl border border-white/[0.07] light:border-black/[0.07] bg-[#161618] light:bg-white overflow-hidden">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-brand" />
            <div>
              <h4 className="text-xs font-semibold text-[#f2f2f0] light:text-[#1a1a18]">
                Advanced Settings & Future Companion Compatibility
              </h4>
              <p className="text-[10px] text-[#888]">
                Optional auto-import rules and mobile companion device management (experimental)
              </p>
            </div>
          </div>
          {showAdvanced ? (
            <ChevronUp className="w-4 h-4 text-[#888]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#888]" />
          )}
        </button>

        {showAdvanced && (
          <div className="p-5 border-t border-white/[0.07] light:border-black/[0.07] space-y-5">
            {/* Auto-Import Rule */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-white/[0.02] light:bg-black/[0.02] border border-white/[0.05]">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-[#f2f2f0] light:text-[#1a1a18] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#5cb98a]" /> Auto-Import Rule for Verified Transactions
                </span>
                <p className="text-[11px] text-[#a8a8a3] leading-relaxed">
                  When enabled, transactions that contain an explicit UPI reference or bank UTR can be imported directly into your records. Items without a reference remain safely in the review queue.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(settings.auto_import_enabled)}
                disabled={busy}
                onChange={(e) => toggleAutoImportSetting(e.target.checked)}
                className="mt-1 accent-brand w-4 h-4 cursor-pointer"
              />
            </div>

            {/* Companion Pairing & Devices (Postponed for future release) */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Pairing code generator */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-brand" />
                  <span className="text-xs font-semibold text-[#f2f2f0]">Generate Pairing Code</span>
                </div>
                <p className="text-[11px] text-[#a8a8a3] leading-relaxed">
                  Pairing is optional. Kept for developers testing the isolated Android notification companion prototype.
                </p>
                <button
                  disabled={busy}
                  onClick={createPairingCode}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-[#f2f2f0]"
                >
                  Create 10-min Code
                </button>
                {pairingCode && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-black/30">
                    <code className="text-xs font-mono text-brand flex-1 truncate">{pairingCode}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(pairingCode);
                        setNotification({ type: 'info', text: 'Pairing code copied.' });
                      }}
                      className="p-1 text-[#a8a8a3] hover:text-[#f2f2f0]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Paired devices list */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-[#a8a8a3]" />
                    <span className="text-xs font-semibold text-[#f2f2f0]">Paired Mobile Devices</span>
                  </div>
                  <span className="text-[10px] text-brand font-semibold">{devices.length} registered</span>
                </div>

                {devices.length === 0 ? (
                  <p className="text-[11px] text-[#888] py-2">No Android devices paired.</p>
                ) : (
                  <div className="space-y-2">
                    {devices.map((d) => (
                      <div
                        key={d.device_id}
                        className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] text-xs"
                      >
                        <div>
                          <div className="font-semibold text-[#f2f2f0]">{d.device_name}</div>
                          <div className="text-[9px] text-[#888]">
                            Added: {dateLabel(d.created_at)}
                          </div>
                        </div>
                        <button
                          onClick={() => disconnectDevice(d.device_id)}
                          className="p-1 text-[#e0655a] hover:bg-[#e0655a]/10 rounded"
                          title="Disconnect device"
                        >
                          <Unplug className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
