
import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  PayrollRun,
  PayrollStatus,
  PayrollLineItem,
  Role,
  getPayrollBalanceDue
} from '../../types';
import { generatePayrollLineItems } from '../../services/payrollService';
import { resolvePayrollStatusAfterSettlement } from '../../services/payrollService';
import {
  exportPayrollExcel,
  exportPayrollPDF,
  exportPayrollRegisterExcel,
  exportPayrollRegisterPDF,
  exportPayrollZip,
  PayrollRegisterFilters
} from '../../services/payrollExportService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<PayrollStatus, string> = {
  [PayrollStatus.DRAFT]: 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20',
  [PayrollStatus.APPROVED]: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
  [PayrollStatus.PARTIALLY_PAID]: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
  [PayrollStatus.PAID]: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
  [PayrollStatus.CANCELLED]: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
};

const inputCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600';
const selectCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all';
const labelCls = 'block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5';

const STATUS_LABELS: Record<PayrollStatus, string> = {
  [PayrollStatus.DRAFT]: 'Draft',
  [PayrollStatus.APPROVED]: 'Approved',
  [PayrollStatus.PARTIALLY_PAID]: 'Partially Paid',
  [PayrollStatus.PAID]: 'Paid',
  [PayrollStatus.CANCELLED]: 'Cancelled',
};

/** Statuses that count towards summary card totals */
const SUMMARY_STATUSES: PayrollStatus[] = [
  PayrollStatus.APPROVED,
  PayrollStatus.PARTIALLY_PAID,
  PayrollStatus.PAID,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDate = (ts: number | string | undefined) => {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatCurrencyLocal = (amount: number, symbol: string) =>
  `${symbol} ${amount.toFixed(2)}`;

/** Get month period from YYYY-MM */
const getMonthPeriod = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
};

/** Get line type badge style */
const getTypeBadge = (type: string) => {
  if (type === 'guarantee') return 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20';
  if (type === 'manual_adjustment') return 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20';
  return 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20';
};

/** Get line type row highlight */
const getTypeRowBg = (type: string) => {
  if (type === 'guarantee') return 'bg-amber-900/10';
  if (type === 'manual_adjustment') return 'bg-purple-900/10';
  return '';
};

const STATUS_DOT: Record<string, string> = {
  'Present': 'text-emerald-400',
  'Taught': 'text-emerald-400',
  'Absent (Excused)': 'text-amber-400',
  'Absent (Unexcused)': 'text-red-400',
  'Cancelled': 'text-slate-500',
};

/** Render description cell for payroll line items */
const DescriptionCell: React.FC<{ description: string; type: string }> = ({ description, type }) => {
  if (type === 'lesson') {
    const parts = description.split(' — ');
    const name = parts[0] || description;
    const duration = parts[1]?.match(/(\d+min)/)?.[1] || '';
    const status = parts[2] || '';
    return (
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="text-white font-medium truncate">{name}</span>
        {duration && <span className="text-slate-500 text-[10px] shrink-0">{duration}</span>}
        {status && <span className={`text-[10px] shrink-0 font-medium ${STATUS_DOT[status] || 'text-slate-400'}`}>{status}</span>}
      </span>
    );
  }
  if (type === 'guarantee') {
    // Format: "Guarantee adjustment — Instrument — School — Date"
    const parts = description.split(' — ');
    const instrument = parts[1] || '';
    const school = parts[2] || '';
    const date = parts[3] || '';
    return (
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-amber-400 text-xs font-medium">Guarantee · {instrument}</span>
        {(school || date) && (
          <span className="text-slate-500 text-[10px]">{[school, date].filter(Boolean).join(' · ')}</span>
        )}
      </span>
    );
  }
  // manual_adjustment — show as-is, truncated
  return <span className="text-slate-300 text-xs truncate">{description}</span>;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PayrollManagement: React.FC = () => {
  const {
    currentUser,
    teachers,
    lessons,
    schools,
    payrollRuns,
    addPayrollRun,
    updatePayrollRun,
    deletePayrollRun,
    formatCurrency,
    getCurrencySymbol,
  } = useApp();

  // ---- UI state ----
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showGenerate, setShowGenerate] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [settleId, setSettleId] = useState<string | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [saving, setSaving] = useState(false);

  // ---- Register export state ----
  const [showRegister, setShowRegister] = useState(false);
  const [regMonth, setRegMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [regSchool, setRegSchool] = useState('');
  const [regStatus, setRegStatus] = useState('all');

  // ---- Row selection ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ---- Generate form state ----
  const [genTeacherId, setGenTeacherId] = useState('');
  const [genMonthYM, setGenMonthYM] = useState('');  // YYYY-MM for month dropdown
  const [genPeriodStart, setGenPeriodStart] = useState('');
  const [genPeriodEnd, setGenPeriodEnd] = useState('');
  const [genSchoolFilter, setGenSchoolFilter] = useState('');
  const [genNotes, setGenNotes] = useState('');
  const [genError, setGenError] = useState('');

  // ---- Preview + editable line items state ----
  const [previewLines, setPreviewLines] = useState<PayrollLineItem[]>([]);
  const [hasPreview, setHasPreview] = useState(false);

  // ---- Draft editing ----
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  // ---- Manual line item entry ----
  const [manualDesc, setManualDesc] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDate, setManualDate] = useState('');

  if (currentUser?.role !== Role.ADMIN) {
    return <div className="text-red-500">Only admins can manage payroll.</div>;
  }

  const currencySymbol = getCurrencySymbol();

  // ---- Filtering ----
  const filtered = useMemo(() => {
    let list = [...payrollRuns];
    if (statusFilter !== 'all') {
      list = list.filter(pr => pr.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(pr =>
        pr.teacherName?.toLowerCase().includes(q) ||
        pr.payrollNumber?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [payrollRuns, statusFilter, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(pr => selectedIds.has(pr.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(pr => next.delete(pr.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(pr => next.add(pr.id));
        return next;
      });
    }
  };

  // ---- Summary stats (ONLY approved + partially_paid + paid) ----
  const stats = useMemo(() => {
    const active = payrollRuns.filter(pr => SUMMARY_STATUSES.includes(pr.status));
    const total = active.length;
    const totalPayable = active.reduce((s, pr) => s + pr.totalPayable, 0);
    const totalPaid = active.reduce((s, pr) => s + pr.paidAmount, 0);
    const outstanding = totalPayable - totalPaid;
    return { total, totalPayable, totalPaid, outstanding };
  }, [payrollRuns]);

  // ---- Compute totals from current previewLines ----
  const computeTotals = (lines: PayrollLineItem[]) => {
    const lessonTotal = parseFloat(lines.filter(l => l.type === 'lesson').reduce((s, l) => s + l.amount, 0).toFixed(2));
    const guaranteeTotal = parseFloat(lines.filter(l => l.type === 'guarantee').reduce((s, l) => s + l.amount, 0).toFixed(2));
    const manualAdjustmentTotal = parseFloat(lines.filter(l => l.type === 'manual_adjustment').reduce((s, l) => s + l.amount, 0).toFixed(2));
    const totalPayable = parseFloat((lessonTotal + guaranteeTotal + manualAdjustmentTotal).toFixed(2));
    return { lessonTotal, guaranteeTotal, manualAdjustmentTotal, totalPayable };
  };

  const previewTotals = useMemo(() => computeTotals(previewLines), [previewLines]);

  // ---- Month dropdown handler ----
  const handleMonthChange = (ym: string) => {
    setGenMonthYM(ym);
    setHasPreview(false);
    setPreviewLines([]);
    if (ym) {
      const { start, end } = getMonthPeriod(ym);
      setGenPeriodStart(start);
      setGenPeriodEnd(end);
    }
  };

  // ---- Generate preview ----
  const handlePreview = () => {
    setGenError('');
    if (!genTeacherId || !genPeriodStart || !genPeriodEnd) {
      setGenError('Teacher, start date, and end date are required.');
      return;
    }
    if (genPeriodStart > genPeriodEnd) {
      setGenError('Start date must be before end date.');
      return;
    }
    const teacher = teachers.find(t => t.id === genTeacherId);
    if (!teacher) {
      setGenError('Teacher not found.');
      return;
    }
    const result = generatePayrollLineItems(
      teacher, lessons, schools,
      genPeriodStart, genPeriodEnd,
      genSchoolFilter || undefined
    );
    setPreviewLines([...result.lessonLines, ...result.guaranteeLines]);
    setHasPreview(true);
  };

  // ---- Add manual line item ----
  const addManualLineItem = () => {
    if (!manualDesc.trim()) return;
    const amt = parseFloat(manualAmount) || 0;
    const dateTs = manualDate ? new Date(manualDate + 'T00:00:00Z').getTime() : Date.now();
    const line: PayrollLineItem = {
      date: dateTs,
      description: manualDesc.trim(),
      hours: 0,
      rate: 0,
      amount: amt,
      type: 'manual_adjustment',
    };
    setPreviewLines(prev => [...prev, line]);
    setManualDesc('');
    setManualAmount('');
    setManualDate('');
  };

  // ---- Remove line item (draft preview only) ----
  const removePreviewLine = (index: number) => {
    setPreviewLines(prev => prev.filter((_, i) => i !== index));
  };

  // ---- Open draft for editing ----
  const handleEditDraft = (pr: PayrollRun) => {
    setViewingId(null);
    setEditingDraftId(pr.id);
    setGenTeacherId(pr.teacherId);
    setGenSchoolFilter(pr.schoolFilter || '');
    setGenPeriodStart(pr.periodStart);
    setGenPeriodEnd(pr.periodEnd);
    setGenNotes(pr.notes || '');
    setPreviewLines(pr.lineItems || []);
    setHasPreview(true);
    setGenError('');
    setShowGenerate(true);
  };

  const resetGenerateForm = () => {
    setShowGenerate(false);
    setEditingDraftId(null);
    setHasPreview(false);
    setPreviewLines([]);
    setGenTeacherId('');
    setGenMonthYM('');
    setGenPeriodStart('');
    setGenPeriodEnd('');
    setGenSchoolFilter('');
    setGenNotes('');
    setGenError('');
  };

  // ---- Save payroll run ----
  const handleSave = async () => {
    if (!hasPreview || !genTeacherId || previewLines.length === 0) return;
    setSaving(true);
    setGenError('');
    try {
      const teacher = teachers.find(t => t.id === genTeacherId);
      const totals = computeTotals(previewLines);

      if (editingDraftId) {
        // Update existing draft
        await updatePayrollRun(editingDraftId, {
          teacherId: genTeacherId,
          teacherName: teacher?.name || genTeacherId,
          periodStart: genPeriodStart,
          periodEnd: genPeriodEnd,
          schoolFilter: genSchoolFilter || undefined,
          lineItems: previewLines,
          lessonTotal: totals.lessonTotal,
          guaranteeTotal: totals.guaranteeTotal,
          manualAdjustmentTotal: totals.manualAdjustmentTotal,
          totalPayable: totals.totalPayable,
          notes: genNotes || undefined,
        } as any);
        resetGenerateForm();
      } else {
        const result = await addPayrollRun({
          teacherId: genTeacherId,
          teacherName: teacher?.name || genTeacherId,
          periodStart: genPeriodStart,
          periodEnd: genPeriodEnd,
          schoolFilter: genSchoolFilter || undefined,
          lineItems: previewLines,
          lessonTotal: totals.lessonTotal,
          guaranteeTotal: totals.guaranteeTotal,
          manualAdjustmentTotal: totals.manualAdjustmentTotal,
          totalPayable: totals.totalPayable,
          paidAmount: 0,
          status: PayrollStatus.DRAFT,
          isLocked: false,
          notes: genNotes || undefined,
          createdBy: currentUser?.id || '',
        } as any);
        if (!result.success) {
          setGenError(result.message || 'Failed to create payroll run.');
        } else {
          resetGenerateForm();
        }
      }
    } catch (e: any) {
      setGenError(e.message || 'Error saving payroll run.');
    }
    setSaving(false);
  };

  // ---- Approve ----
  const handleApprove = async (pr: PayrollRun) => {
    if (pr.status !== PayrollStatus.DRAFT) return;
    await updatePayrollRun(pr.id, {
      status: PayrollStatus.APPROVED,
      isLocked: true,
    });
  };

  // ---- Revert approved run back to draft ----
  const handleRevertToDraft = async (pr: PayrollRun) => {
    if (pr.status !== PayrollStatus.APPROVED) return;
    await updatePayrollRun(pr.id, {
      status: PayrollStatus.DRAFT,
      isLocked: false,
    });
  };

  // ---- Settle (record payment) ----
  const handleSettle = async () => {
    if (!settleId) return;
    const pr = payrollRuns.find(p => p.id === settleId);
    if (!pr) return;
    const amt = parseFloat(settleAmount);
    if (!Number.isFinite(amt) || amt < 0) return;
    const newPaidAmount = parseFloat((pr.paidAmount + amt).toFixed(2));
    const { status, isLocked } = resolvePayrollStatusAfterSettlement(pr, newPaidAmount);
    await updatePayrollRun(pr.id, {
      paidAmount: newPaidAmount,
      status,
      isLocked,
      paidAt: status === PayrollStatus.PAID ? Date.now() : pr.paidAt,
    });
    setSettleId(null);
    setSettleAmount('');
  };

  // ---- Delete (draft + cancelled only) ----
  const handleDelete = async (id: string) => {
    const pr = payrollRuns.find(p => p.id === id);
    if (!pr) return;
    if (pr.status !== PayrollStatus.DRAFT && pr.status !== PayrollStatus.CANCELLED) return;
    await deletePayrollRun(id);
    setConfirmDeleteId(null);
    if (viewingId === id) setViewingId(null);
  };

  // ---- Cancel ----
  const handleCancel = async (pr: PayrollRun) => {
    if (pr.status === PayrollStatus.PAID) return;
    await updatePayrollRun(pr.id, {
      status: PayrollStatus.CANCELLED,
      isLocked: true,
    });
  };

  // ---- Viewing detail ----
  const viewingPayroll = viewingId ? payrollRuns.find(pr => pr.id === viewingId) : null;

  // ========== RENDER ==========

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Payroll Management</h1>
            <p className="text-slate-500 text-sm mt-0.5">Generate, review, approve, and settle teacher payroll runs</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRegister(true)}
            className="px-4 py-2.5 bg-slate-800/80 ring-1 ring-white/10 text-slate-300 hover:bg-slate-700/80 rounded-xl transition-all text-sm font-medium"
          >
            {selectedIds.size > 0 ? `Export ${selectedIds.size} Selected` : 'Export Register'}
          </button>
          <button
            onClick={() => { setShowGenerate(true); setHasPreview(false); setPreviewLines([]); setGenError(''); }}
            className="px-4 py-2.5 bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white rounded-xl transition-all text-sm font-medium"
          >
            + Generate Payroll
          </button>
        </div>
      </div>

      {/* Summary Cards (approved + partially_paid + paid ONLY) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Active Runs</p>
          <p className="text-2xl font-bold text-white mt-2 tabular-nums">{stats.total}</p>
        </div>
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Total Payable</p>
          <p className="text-2xl font-bold text-white mt-2 tabular-nums">{formatCurrencyLocal(stats.totalPayable, currencySymbol)}</p>
        </div>
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Total Paid</p>
          <p className="text-2xl font-bold text-emerald-400 mt-2 tabular-nums">{formatCurrencyLocal(stats.totalPaid, currencySymbol)}</p>
        </div>
        <div className="bg-slate-900/60 ring-1 ring-amber-500/10 rounded-2xl p-5">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Outstanding</p>
          <p className="text-2xl font-bold text-amber-400 mt-2 tabular-nums">{formatCurrencyLocal(stats.outstanding, currencySymbol)}</p>
        </div>
      </div>

      {/* Selection badge */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-400 -mb-4">
          <span className="px-2 py-1 rounded-full bg-primary-500/15 text-primary-300 font-medium">
            {selectedIds.size} selected
          </span>
          <button
            onClick={clearSelection}
            className="text-slate-500 hover:text-slate-300 transition-colors underline-offset-2 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by teacher or payroll number…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/40 text-slate-400 text-[10px] font-medium uppercase tracking-wider">
                <th className="px-4 py-3.5 w-8">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500/40 cursor-pointer"
                    title={allFilteredSelected ? 'Deselect all' : 'Select all visible'}
                  />
                </th>
                <th className="text-left px-5 py-3.5">Payroll #</th>
                <th className="text-left px-5 py-3.5">Teacher</th>
                <th className="text-left px-5 py-3.5">Period</th>
                <th className="text-right px-5 py-3.5">Total</th>
                <th className="text-right px-5 py-3.5">Paid</th>
                <th className="text-right px-5 py-3.5">Balance</th>
                <th className="text-center px-5 py-3.5">Status</th>
                <th className="text-center px-5 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center text-slate-500 py-10">No payroll runs found</td></tr>
              )}
              {filtered.map(pr => {
                const balance = getPayrollBalanceDue(pr);
                const canDelete = pr.status === PayrollStatus.DRAFT || pr.status === PayrollStatus.CANCELLED;
                return (
                  <tr key={pr.id} onClick={() => setViewingId(pr.id)} className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${selectedIds.has(pr.id) ? 'bg-primary-900/10' : ''}`}>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(pr.id)}
                        onChange={() => toggleSelect(pr.id)}
                        className="rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-500/40 cursor-pointer"
                      />
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-300">{pr.payrollNumber}</td>
                    <td className="px-5 py-3.5 text-white">{pr.teacherName}</td>
                    <td className="px-5 py-3.5 text-slate-300 text-xs">
                      {formatDate(pr.periodStart)} – {formatDate(pr.periodEnd)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-white tabular-nums">{formatCurrency(pr.totalPayable)}</td>
                    <td className="px-5 py-3.5 text-right text-emerald-400 tabular-nums">{formatCurrency(pr.paidAmount)}</td>
                    <td className="px-5 py-3.5 text-right text-amber-400 tabular-nums">{formatCurrency(balance)}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[pr.status] || ''}`}>
                        {STATUS_LABELS[pr.status] || pr.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        {(pr.status === PayrollStatus.DRAFT || pr.status === PayrollStatus.APPROVED || pr.status === PayrollStatus.PARTIALLY_PAID) && (
                          <button
                            onClick={() => handleEditDraft(pr)}
                            className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                          >Edit</button>
                        )}
                        {pr.status === PayrollStatus.DRAFT && (
                          <button
                            onClick={() => handleApprove(pr)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                          >Approve</button>
                        )}
                        {pr.status === PayrollStatus.APPROVED && (
                          <button
                            onClick={() => handleRevertToDraft(pr)}
                            className="text-xs text-slate-400 hover:text-amber-300 font-medium transition-colors"
                          >Revert</button>
                        )}
                        {(pr.status === PayrollStatus.APPROVED || pr.status === PayrollStatus.PARTIALLY_PAID) && (
                          <button
                            onClick={() => { setSettleId(pr.id); setSettleAmount(''); }}
                            className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors"
                          >Settle</button>
                        )}
                        {pr.status !== PayrollStatus.PAID && pr.status !== PayrollStatus.CANCELLED && (
                          <button
                            onClick={() => handleCancel(pr)}
                            className="text-xs text-slate-400 hover:text-slate-200 font-medium transition-colors"
                          >Cancel</button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setConfirmDeleteId(pr.id)}
                            className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
                          >Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ Generate Payroll Modal ============ */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto pt-8 pb-8">
          <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 w-full max-w-3xl mx-4">
            <h2 className="text-base font-semibold text-white mb-5">{editingDraftId ? 'Edit Payroll Run' : 'Generate Payroll Run'}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div>
                <label className={labelCls}>Teacher *</label>
                <select
                  value={genTeacherId}
                  onChange={e => { setGenTeacherId(e.target.value); setHasPreview(false); setPreviewLines([]); }}
                  className={selectCls}
                >
                  <option value="">Select teacher…</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>School Filter (optional)</label>
                <select
                  value={genSchoolFilter}
                  onChange={e => { setGenSchoolFilter(e.target.value); setHasPreview(false); setPreviewLines([]); }}
                  className={selectCls}
                >
                  <option value="">All Schools</option>
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Month dropdown — auto-fills period dates */}
              <div>
                <label className={labelCls}>Month</label>
                <input
                  type="month"
                  value={genMonthYM}
                  onChange={e => handleMonthChange(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="md:col-span-1"></div>

              <div>
                <label className={labelCls}>Period Start *</label>
                <input
                  type="date"
                  value={genPeriodStart}
                  onChange={e => { setGenPeriodStart(e.target.value); setHasPreview(false); setPreviewLines([]); }}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Period End *</label>
                <input
                  type="date"
                  value={genPeriodEnd}
                  onChange={e => { setGenPeriodEnd(e.target.value); setHasPreview(false); setPreviewLines([]); }}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="mb-5">
              <label className={labelCls}>Notes (optional)</label>
              <textarea
                value={genNotes}
                onChange={e => setGenNotes(e.target.value)}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>

            {genError && <p className="text-red-400 text-sm mb-3 bg-red-500/5 ring-1 ring-red-500/20 rounded-lg px-3.5 py-2.5">{genError}</p>}

            <div className="flex gap-3 mb-5">
              <button
                onClick={handlePreview}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white rounded-xl transition-all text-sm font-medium"
              >
                Preview
              </button>
              {hasPreview && previewLines.length > 0 && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2.5 bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white rounded-xl transition-all text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editingDraftId ? 'Save Changes' : 'Save as Draft'}
                </button>
              )}
              <button
                onClick={resetGenerateForm}
                className="px-4 py-2.5 bg-slate-800/80 ring-1 ring-white/10 hover:bg-slate-700/80 text-slate-300 rounded-xl transition-all text-sm"
              >
                Cancel
              </button>
            </div>

            {/* Preview Table + Manual Line Items */}
            {hasPreview && (
              <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-xl overflow-hidden">
                <div className="bg-slate-800/60 px-4 py-2.5 text-xs text-slate-300">
                  <div className="flex justify-between flex-wrap gap-2">
                    <span>{previewLines.length} line items</span>
                    <span className="tabular-nums">
                      Lessons: {formatCurrency(previewTotals.lessonTotal)}
                      {' + '}Guarantee: {formatCurrency(previewTotals.guaranteeTotal)}
                      {previewTotals.manualAdjustmentTotal !== 0 && (
                        <>{' + '}Manual: {formatCurrency(previewTotals.manualAdjustmentTotal)}</>
                      )}
                      {' = '}<strong className="text-white">{formatCurrency(previewTotals.totalPayable)}</strong>
                    </span>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-700/30 text-slate-400 text-[10px] font-medium uppercase tracking-wider">
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-left px-3 py-2">Description</th>
                        <th className="text-left px-3 py-2">School</th>
                        <th className="text-right px-3 py-2">Hours</th>
                        <th className="text-right px-3 py-2">Rate</th>
                        <th className="text-right px-3 py-2">Amount</th>
                        <th className="text-center px-3 py-2">Type</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {[...previewLines]
                        .map((line, origIdx) => ({ line, origIdx }))
                        .sort((a, b) => a.line.date - b.line.date)
                        .map(({ line, origIdx }) => (
                        <tr key={origIdx} className={getTypeRowBg(line.type)}>
                          <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap">{formatDate(line.date)}</td>
                          <td className="px-3 py-1.5 max-w-[200px]"><DescriptionCell description={line.description} type={line.type} /></td>
                          <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{line.schoolName || '—'}</td>
                          <td className="px-3 py-1.5 text-right text-slate-300">{line.hours.toFixed(2)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-300">{formatCurrencyLocal(line.rate, currencySymbol)}</td>
                          <td className="px-3 py-1.5 text-right text-white">{formatCurrencyLocal(line.amount, currencySymbol)}</td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getTypeBadge(line.type)}`}>
                              {line.type === 'manual_adjustment' ? 'manual' : line.type}
                            </span>
                          </td>
                          <td className="px-1">
                            <button
                              type="button"
                              onClick={() => removePreviewLine(origIdx)}
                              className="text-red-500 hover:text-red-400 text-xs px-1"
                              title="Remove line"
                            >&times;</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add manual line item */}
                <div className="border-t border-slate-700/50 px-3 py-3 bg-slate-800/60">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">Description</label>
                      <input
                        type="text"
                        value={manualDesc}
                        onChange={e => setManualDesc(e.target.value)}
                        placeholder="e.g. Travel allowance, Bonus, Deduction..."
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:ring-1 focus:ring-primary-500 outline-none transition-all"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        value={manualAmount}
                        onChange={e => setManualAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:ring-1 focus:ring-primary-500 outline-none transition-all tabular-nums"
                      />
                    </div>
                    <div className="w-32">
                      <label className="block text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">Date (opt.)</label>
                      <input
                        type="date"
                        value={manualDate}
                        onChange={e => setManualDate(e.target.value)}
                        className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:ring-1 focus:ring-primary-500 outline-none transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addManualLineItem}
                      className="bg-purple-600/80 hover:bg-purple-600 ring-1 ring-purple-500/30 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ View Detail Modal ============ */}
      {viewingPayroll && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto pt-8 pb-8">
          <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 w-full max-w-3xl mx-4">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h2 className="text-base font-semibold text-white">{viewingPayroll.payrollNumber}</h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  {viewingPayroll.teacherName} • {formatDate(viewingPayroll.periodStart)} – {formatDate(viewingPayroll.periodEnd)}
                </p>
                {viewingPayroll.schoolFilter && (
                  <p className="text-xs text-slate-500 mt-1">
                    School: {schools.find(s => s.id === viewingPayroll.schoolFilter)?.name || viewingPayroll.schoolFilter}
                  </p>
                )}
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[viewingPayroll.status]}`}>
                {STATUS_LABELS[viewingPayroll.status]}
              </span>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-3 text-center">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Total Payable</p>
                <p className="text-lg font-bold text-white mt-1 tabular-nums">{formatCurrency(viewingPayroll.totalPayable)}</p>
              </div>
              <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-3 text-center">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Paid</p>
                <p className="text-lg font-bold text-emerald-400 mt-1 tabular-nums">{formatCurrency(viewingPayroll.paidAmount)}</p>
              </div>
              <div className="bg-slate-800/60 ring-1 ring-amber-500/10 rounded-xl p-3 text-center">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Balance</p>
                <p className="text-lg font-bold text-amber-400 mt-1 tabular-nums">{formatCurrency(getPayrollBalanceDue(viewingPayroll))}</p>
              </div>
            </div>

            {viewingPayroll.notes && (
              <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-3 mb-5">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Notes</p>
                <p className="text-sm text-slate-300">{viewingPayroll.notes}</p>
              </div>
            )}

            {/* Line Items */}
            <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-xl overflow-hidden mb-5">
              <div className="bg-slate-800/60 px-4 py-2.5 text-xs text-slate-300 tabular-nums">
                <span>{viewingPayroll.lineItems?.length || 0} line items</span>
                <span className="mx-3">•</span>
                <span>Lessons: {formatCurrency(viewingPayroll.lessonTotal)}</span>
                <span className="mx-3">•</span>
                <span>Guarantee: {formatCurrency(viewingPayroll.guaranteeTotal)}</span>
                {(viewingPayroll.manualAdjustmentTotal ?? 0) !== 0 && (
                  <>
                    <span className="mx-3">•</span>
                    <span>Manual: {formatCurrency(viewingPayroll.manualAdjustmentTotal || 0)}</span>
                  </>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-700/30 text-slate-400 text-[10px] font-medium uppercase tracking-wider">
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Description</th>
                      <th className="text-left px-3 py-2">School</th>
                      <th className="text-right px-3 py-2">Hours</th>
                      <th className="text-right px-3 py-2">Rate</th>
                      <th className="text-right px-3 py-2">Amount</th>
                      <th className="text-center px-3 py-2">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {(viewingPayroll.lineItems || [])
                      .sort((a: PayrollLineItem, b: PayrollLineItem) => a.date - b.date)
                      .map((line: PayrollLineItem, i: number) => (
                      <tr key={i} className={getTypeRowBg(line.type)}>
                        <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap">{formatDate(line.date)}</td>
                        <td className="px-3 py-1.5 text-white max-w-[180px] truncate">{line.description}</td>
                        <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{line.schoolName || '—'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-300">{line.hours.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-300">{formatCurrencyLocal(line.rate, currencySymbol)}</td>
                        <td className="px-3 py-1.5 text-right text-white">{formatCurrencyLocal(line.amount, currencySymbol)}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getTypeBadge(line.type)}`}>
                            {line.type === 'manual_adjustment' ? 'manual' : line.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              {viewingPayroll.status === PayrollStatus.APPROVED && (
                <button
                  onClick={() => handleRevertToDraft(viewingPayroll)}
                  className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 ring-1 ring-amber-500/20 text-amber-400 rounded-xl transition-colors text-sm font-medium"
                >
                  Revert to Draft
                </button>
              )}
              {(viewingPayroll.status === PayrollStatus.DRAFT || viewingPayroll.status === PayrollStatus.APPROVED || viewingPayroll.status === PayrollStatus.PARTIALLY_PAID) && (
                <button
                  onClick={() => handleEditDraft(viewingPayroll)}
                  className="px-4 py-2.5 bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white rounded-xl transition-all text-sm font-medium"
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => {
                  const schoolName = viewingPayroll.schoolFilter
                    ? schools.find(s => s.id === viewingPayroll.schoolFilter)?.name
                    : undefined;
                  exportPayrollExcel(viewingPayroll, schoolName);
                }}
                className="px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20 text-emerald-400 rounded-xl transition-colors text-sm"
              >Excel</button>
              <button
                onClick={() => {
                  const schoolName = viewingPayroll.schoolFilter
                    ? schools.find(s => s.id === viewingPayroll.schoolFilter)?.name
                    : undefined;
                  exportPayrollPDF(viewingPayroll, schoolName);
                }}
                className="px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 ring-1 ring-blue-500/20 text-blue-400 rounded-xl transition-colors text-sm"
              >PDF</button>
              <button
                onClick={() => setViewingId(null)}
                className="px-4 py-2.5 bg-slate-800/80 ring-1 ring-white/10 hover:bg-slate-700/80 text-slate-300 rounded-xl transition-all text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Settle Modal ============ */}
      {settleId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-white mb-4">Record Payment</h3>
            {(() => {
              const pr = payrollRuns.find(p => p.id === settleId);
              if (!pr) return null;
              const balance = getPayrollBalanceDue(pr);
              return (
                <>
                  <p className="text-sm text-slate-400 mb-1">
                    {pr.payrollNumber} — {pr.teacherName}
                  </p>
                  <p className="text-sm text-slate-400 mb-4 tabular-nums">
                    Balance due: <span className="text-amber-400 font-medium">{formatCurrency(balance)}</span>
                  </p>
                  <div className="mb-5">
                    <label className={labelCls}>Payment Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={balance}
                      value={settleAmount}
                      onChange={e => setSettleAmount(e.target.value)}
                      className={inputCls}
                      placeholder={`Max: ${balance.toFixed(2)}`}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSettle}
                      disabled={!settleAmount || parseFloat(settleAmount) <= 0}
                      className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white rounded-xl transition-all text-sm font-medium disabled:opacity-50"
                    >
                      Confirm Payment
                    </button>
                    <button
                      onClick={() => setSettleId(null)}
                      className="px-4 py-2.5 bg-slate-800/80 ring-1 ring-white/10 hover:bg-slate-700/80 text-slate-300 rounded-xl transition-all text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ============ Confirm Delete Modal ============ */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-semibold text-white mb-2">Delete Payroll Run?</h3>
            <p className="text-sm text-slate-400 mb-5">This action cannot be undone. Only draft and cancelled payrolls can be deleted.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white rounded-xl transition-all text-sm font-medium"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2.5 bg-slate-800/80 ring-1 ring-white/10 hover:bg-slate-700/80 text-slate-300 rounded-xl transition-all text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Register Export Modal ============ */}
      {showRegister && (() => {
        const isSelectionMode = selectedIds.size > 0;
        const selectedRuns = payrollRuns.filter(pr => selectedIds.has(pr.id));

        const handleExcelFilter = () => {
          exportPayrollRegisterExcel(payrollRuns, schools, {
            month: regMonth,
            schoolFilter: regSchool || undefined,
            statusFilter: regStatus,
          });
        };
        const handlePdfFilter = () => {
          exportPayrollRegisterPDF(payrollRuns, schools, {
            month: regMonth,
            schoolFilter: regSchool || undefined,
            statusFilter: regStatus,
          });
        };
        const handleExcelSelected = () => {
          exportPayrollRegisterExcel(selectedRuns, schools, {
            month: regMonth,
            preFiltered: true,
            labelOverride: `Selected Runs (${selectedRuns.length})`,
          });
        };
        const handlePdfSelected = () => {
          exportPayrollRegisterPDF(selectedRuns, schools, {
            month: regMonth,
            preFiltered: true,
            labelOverride: `Selected Runs (${selectedRuns.length})`,
          });
        };
        const handleZipSelected = () => {
          exportPayrollZip(selectedRuns, schools);
        };

        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 w-full max-w-md mx-4">
              <h3 className="text-base font-semibold text-white mb-5">Export Payroll Register</h3>

              {isSelectionMode ? (
                /* ── Selection mode ── */
                <div className="mb-5">
                  <div className="flex items-center gap-3 bg-primary-500/10 ring-1 ring-primary-500/20 rounded-xl px-4 py-3 mb-4">
                    <svg className="w-4 h-4 text-primary-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-primary-300 font-medium">{selectedIds.size} payroll run{selectedIds.size !== 1 ? 's' : ''} selected</span>
                  </div>
                  <div className="bg-slate-800/40 rounded-xl overflow-hidden divide-y divide-slate-800/60 max-h-52 overflow-y-auto">
                    {selectedRuns
                      .sort((a, b) => a.teacherName.localeCompare(b.teacherName))
                      .map(pr => (
                        <div key={pr.id} className="flex items-center justify-between px-3 py-2 text-xs">
                          <span className="text-white font-medium">{pr.teacherName}</span>
                          <span className="text-slate-500 ml-2">{pr.payrollNumber}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                /* ── Filter mode ── */
                <div className="space-y-4 mb-5">
                  <div>
                    <label className={labelCls}>Month *</label>
                    <input
                      type="month"
                      value={regMonth}
                      onChange={e => setRegMonth(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>School (optional)</label>
                    <select value={regSchool} onChange={e => setRegSchool(e.target.value)} className={selectCls}>
                      <option value="">All Schools</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Status (optional)</label>
                    <select value={regStatus} onChange={e => setRegStatus(e.target.value)} className={selectCls}>
                      <option value="all">All Statuses</option>
                      {Object.values(PayrollStatus).map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={isSelectionMode ? handleExcelSelected : handleExcelFilter}
                  className="flex-1 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20 text-emerald-400 rounded-xl transition-colors text-sm font-medium"
                >Excel</button>
                <button
                  onClick={isSelectionMode ? handlePdfSelected : handlePdfFilter}
                  className="flex-1 px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 ring-1 ring-blue-500/20 text-blue-400 rounded-xl transition-colors text-sm font-medium"
                >PDF</button>
                {isSelectionMode && (
                  <button
                    onClick={handleZipSelected}
                    className="flex-1 px-4 py-2.5 bg-violet-500/10 hover:bg-violet-500/20 ring-1 ring-violet-500/20 text-violet-400 rounded-xl transition-colors text-sm font-medium"
                  >ZIP</button>
                )}
                <button
                  onClick={() => setShowRegister(false)}
                  className="px-4 py-2.5 bg-slate-800/80 ring-1 ring-white/10 hover:bg-slate-700/80 text-slate-300 rounded-xl transition-all text-sm"
                >Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
