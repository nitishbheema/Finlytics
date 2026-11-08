import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import {
  Activity, Smartphone, ShieldCheck, RefreshCw, Copy, Unplug,
  CheckCircle2, XCircle, Clock3, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN');

export default function AutoTrack() {
  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [incomeCategories, setIncomeCategories] = useState([]);
  const [settings, setSettings] = useState({ auto_import_enabled: false, require_reference: true });
  const [pairingCode, setPairingCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [eventCategories, setEventCategories] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [deviceData, eventData, settingData, expenseData, incomeData] = await Promise.all([
        api.get('/autotrack/devices'),
        api.get('/autotrack/events?status=pending'),
        api.get('/autotrack/settings'),
        api.get('/categories?type=expense'),
        api.get('/categories?type=income'),
      ]);
      setDevices(deviceData.devices || []);
      setEvents(eventData.events || []);
      setSettings(settingData.settings || { auto_import_enabled: false, require_reference: true });
      setExpenseCategories(expenseData.categories || []);
      setIncomeCategories(incomeData.categories || []);
    } catch (error) {
      setMessage(error.message || 'Could not load AutoTrack settings.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const createPairingCode = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await api.post('/autotrack/pairing-codes', {});
      setPairingCode(result.pairingCode);
      setMessage('Pairing code created. It expires in 10 minutes and can be used once.');
      await loadData();
    } catch (error) { setMessage(error.message || 'Could not create a pairing code.'); }
    finally { setBusy(false); }
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(pairingCode); setMessage('Pairing code copied.'); }
    catch { setMessage('Copy was blocked by this browser. Select the code and copy it manually.'); }
  };

  const toggleAutoImport = async (enabled) => {
    setBusy(true); setMessage('');
    try {
      const result = await api.put('/autotrack/settings', { autoImportEnabled: enabled, requireReference: true });
      setSettings(result.settings);
      setMessage(enabled
        ? 'Auto-import enabled for notifications that contain a UPI/bank reference. Other items stay in review.'
        : 'Auto-import disabled. New notifications will wait for your review.');
    } catch (error) { setMessage(error.message || 'Could not update AutoTrack settings.'); }
    finally { setBusy(false); }
  };

  const disconnectDevice = async (deviceId) => {
    if (!window.confirm('Disconnect this Android device? It will stop syncing new transactions.')) return;
    setBusy(true);
    try { await api.delete(`/autotrack/devices/${deviceId}`); setMessage('Device disconnected.'); await loadData(); }
    catch (error) { setMessage(error.message || 'Could not disconnect device.'); }
    finally { setBusy(false); }
  };

  const decideEvent = async (event, approve) => {
    setBusy(true); setMessage('');
    try {
      if (approve) {
        const cats = event.direction === 'debit' ? expenseCategories : incomeCategories;
        const selected = eventCategories[event.event_id] || cats.find((c) => c.category_name === (event.direction === 'debit' ? 'Other Expense' : 'Other Income'))?.category_id || '';
        await api.post(`/autotrack/events/${event.event_id}/approve`, { categoryId: selected || undefined });
        setMessage('Transaction added to your Finlytics records.');
      } else {
        await api.post(`/autotrack/events/${event.event_id}/reject`, {});
        setMessage('Transaction dismissed.');
      }
      await loadData();
    } catch (error) { setMessage(error.message || 'Could not update this transaction.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand"><Activity className="w-4 h-4" /><span className="text-[11px] uppercase tracking-[0.18em] font-bold">Finlytics AutoTrack</span></div>
          <h1 className="text-2xl font-bold font-display text-[#f2f2f0] light:text-[#1a1a18] mt-1">Automatic transaction tracking</h1>
          <p className="text-xs text-[#a8a8a3] light:text-[#5a5a55] mt-1">Connect an Android companion to detect supported UPI payment notifications.</p>
        </div>
        <button onClick={loadData} disabled={loading || busy} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] light:bg-black/[0.05] text-xs text-[#f2f2f0] light:text-[#1a1a18]">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {message && <div className="p-3 rounded-xl border border-brand/25 bg-brand/10 text-brand text-xs">{message}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <section className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] space-y-4">
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center"><Smartphone className="w-5 h-5" /></div><div><h2 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">Pair Android device</h2><p className="text-[11px] text-[#a8a8a3]">One-time pairing code</p></div></div>
          <p className="text-xs text-[#a8a8a3] leading-relaxed">Open the Finlytics AutoTrack Android companion, enter this code and pair your phone. The code expires after 10 minutes and can only be used once.</p>
          <button onClick={createPairingCode} disabled={busy} className="px-4 py-2.5 rounded-xl bg-brand hover:bg-[#b56832] text-white text-xs font-semibold disabled:opacity-50">Generate pairing code</button>
          {pairingCode && <div className="flex items-center gap-2 rounded-xl bg-black/20 light:bg-black/[0.04] p-3"><code className="flex-1 text-sm tracking-widest break-all text-[#f2f2f0] light:text-[#1a1a18]">{pairingCode}</code><button title="Copy code" onClick={copyCode} className="p-2 rounded-lg bg-white/10 text-[#f2f2f0] light:text-[#1a1a18]"><Copy className="w-4 h-4" /></button></div>}
        </section>

        <section className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] space-y-4">
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[#5cb98a]/15 text-[#5cb98a] flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></div><div><h2 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">Automatic import rule</h2><p className="text-[11px] text-[#a8a8a3]">Conservative by default</p></div></div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={Boolean(settings.auto_import_enabled)} disabled={busy} onChange={(e) => toggleAutoImport(e.target.checked)} className="mt-0.5 accent-[#5cb98a]" />
            <span><span className="block text-xs font-semibold text-[#f2f2f0] light:text-[#1a1a18]">Auto-import transactions with a reference number</span><span className="block text-[11px] text-[#a8a8a3] mt-1">When enabled, notifications containing a UPI reference/UTR are added automatically. Items without a reference stay in your review queue.</span></span>
          </label>
          <div className="text-[11px] text-[#a8a8a3] border-t border-white/[0.07] light:border-black/[0.07] pt-3">No bank passwords, UPI PINs, OTPs or raw notification text are sent to Finlytics.</div>
        </section>
      </div>

      <section className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] space-y-4">
        <div className="flex justify-between items-center"><div><h2 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">Connected devices</h2><p className="text-[11px] text-[#a8a8a3] mt-1">Revoke a device immediately if you lose your phone.</p></div><span className="text-xs text-brand font-semibold">{devices.length} active</span></div>
        {devices.length ? devices.map((device) => <div key={device.device_id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] light:bg-black/[0.03]"><div className="flex items-center gap-3 min-w-0"><Smartphone className="w-4 h-4 text-brand shrink-0"/><div className="min-w-0"><p className="text-xs font-medium text-[#f2f2f0] light:text-[#1a1a18] truncate">{device.device_name}</p><p className="text-[10px] text-[#a8a8a3]">Last sync: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('en-IN') : 'Not synced yet'}</p></div></div><button disabled={busy} onClick={() => disconnectDevice(device.device_id)} className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] text-[#e0655a] bg-[#e0655a]/10"><Unplug className="w-3.5 h-3.5"/> Disconnect</button></div>) : <p className="text-xs text-[#a8a8a3] py-3">No Android devices paired yet.</p>}
      </section>

      <section className="p-5 rounded-2xl bg-[#161618] light:bg-white border border-white/[0.07] light:border-black/[0.07] space-y-4">
        <div className="flex justify-between items-center"><div><h2 className="text-sm font-semibold text-[#f2f2f0] light:text-[#1a1a18]">Review transactions</h2><p className="text-[11px] text-[#a8a8a3] mt-1">Uncertain detections wait here. Check them before adding.</p></div><span className="text-xs text-brand font-semibold">{events.length} pending</span></div>
        {events.length ? events.map((event) => {
          const cats = event.direction === 'debit' ? expenseCategories : incomeCategories;
          const picked = eventCategories[event.event_id] || '';
          return <div key={event.event_id} className="p-3 rounded-xl bg-white/[0.03] light:bg-black/[0.03] space-y-3">
            <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-2.5"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${event.direction === 'debit' ? 'bg-[#e0655a]/10 text-[#e0655a]' : 'bg-[#5cb98a]/10 text-[#5cb98a]'}`}>{event.direction === 'debit' ? <ArrowUpRight className="w-4 h-4"/> : <ArrowDownLeft className="w-4 h-4"/>}</div><div><p className="text-xs font-semibold text-[#f2f2f0] light:text-[#1a1a18]">{event.merchant}</p><p className="text-[10px] text-[#a8a8a3]">{dateLabel(event.transaction_date)} · {event.source_app}</p>{event.reference && <p className="text-[10px] text-[#a8a8a3]">Ref: {event.reference}</p>}</div></div><p className={`text-sm font-bold ${event.direction === 'debit' ? 'text-[#e0655a]' : 'text-[#5cb98a]'}`}>{money(event.amount)}</p></div>
            <div className="flex flex-col sm:flex-row gap-2"><select value={picked} onChange={(e) => setEventCategories((prev) => ({ ...prev, [event.event_id]: e.target.value }))} className="flex-1 px-3 py-2 rounded-lg bg-[#1e1e21] light:bg-[#f0f0ee] text-xs text-[#f2f2f0] light:text-[#1a1a18] border border-white/[0.08] light:border-black/[0.08]"><option value="">Use default category</option>{cats.map((category) => <option key={category.category_id} value={category.category_id}>{category.category_name}</option>)}</select><button disabled={busy} onClick={() => decideEvent(event, true)} className="px-3 py-2 rounded-lg bg-[#5cb98a]/15 text-[#5cb98a] text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5 inline mr-1"/>Add transaction</button><button disabled={busy} onClick={() => decideEvent(event, false)} className="px-3 py-2 rounded-lg bg-[#e0655a]/10 text-[#e0655a] text-xs"><XCircle className="w-3.5 h-3.5 inline mr-1"/>Dismiss</button></div>
          </div>;
        }) : <div className="flex items-center gap-2 py-4 text-xs text-[#a8a8a3]"><Clock3 className="w-4 h-4"/>No transactions waiting for review.</div>}
      </section>

      <p className="text-[10px] text-[#777] leading-relaxed">AutoTrack currently detects supported notifications from apps you select on your Android phone. It cannot read past UPI history, and some payments may not generate a visible notification. For bank-verified coverage across multiple UPI apps, Finlytics still needs an eligible Account Aggregator/FIU partner.</p>
    </div>
  );
}
