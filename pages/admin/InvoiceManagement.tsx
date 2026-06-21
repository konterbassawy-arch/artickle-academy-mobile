
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  Invoice,
  InvoiceStatus,
  InvoicePayerType,
  InvoiceLineItem,
  Lesson,
  LessonStatus,
  DeliveryMode,
  getDeliveryMode,
  Role,
  getInvoiceSubtotal,
  getInvoiceBalanceDue
} from '../../types';
import {
  resolveSchoolGuarantee,
  resolveSchoolRate,
  matchesDeliveryMode,
  normalizeInstrument
} from '../../services/rateService';
import { exportInvoiceExcel, exportInvoicePDF } from '../../services/invoiceExportService';
import { matchesSearch } from '../../services/searchUtils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20',
  [InvoiceStatus.ISSUED]: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
  [InvoiceStatus.PARTIALLY_PAID]: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
  [InvoiceStatus.PAID]: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
  [InvoiceStatus.OVERDUE]: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
  [InvoiceStatus.CANCELLED]: 'bg-red-900/15 text-red-500 ring-1 ring-red-900/20',
};

// ── Shared class constants (visual only) ──────────────────────────────────────
const inputCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600';
const selectCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all';
const labelCls = 'block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5';

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'Draft',
  [InvoiceStatus.ISSUED]: 'Issued',
  [InvoiceStatus.PARTIALLY_PAID]: 'Partially Paid',
  [InvoiceStatus.PAID]: 'Paid',
  [InvoiceStatus.OVERDUE]: 'Overdue',
  [InvoiceStatus.CANCELLED]: 'Cancelled',
};

/** Lesson statuses that are billable on a B2B invoice */
const BILLABLE_STATUSES: readonly LessonStatus[] = [
  LessonStatus.PRESENT,
  LessonStatus.TAUGHT,
  LessonStatus.ABSENT_UNEXCUSED,
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toYYYYMM = (date: string) => date.substring(0, 7);

const formatDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getMonthPeriod = (ym: string) => {
  // ym = "YYYY-MM"
  const [y, m] = ym.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const InvoiceManagement: React.FC = () => {
  const {
    currentUser,
    invoices,
    payments,
    lessons,
    schools,
    teachers,
    parents,
    enrollments,
    students,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    formatCurrency,
    getCurrency,
  } = useApp();
  const navigate = useNavigate();

  // ---- UI state ----
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ---- Creation mode ----
  type CreateMode = 'b2b' | 'b2c_enrollment' | 'b2c_manual';
  const [createMode, setCreateMode] = useState<CreateMode>('b2b');

  // ---- Form state ----
  const [formPayerType, setFormPayerType] = useState<InvoicePayerType>(InvoicePayerType.SCHOOL);
  const [formPayerId, setFormPayerId] = useState('');
  const [formEnrollmentId, setFormEnrollmentId] = useState('');
  const [formPeriodYM, setFormPeriodYM] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [formFromDate, setFormFromDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formAdjustments, setFormAdjustments] = useState(0);
  const [formVatEnabled, setFormVatEnabled] = useState(true);
  const [formVatRate, setFormVatRate] = useState(15);
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<InvoiceStatus>(InvoiceStatus.DRAFT);
  const [formLineItems, setFormLineItems] = useState<InvoiceLineItem[]>([]);
  const [formIsLocked, setFormIsLocked] = useState(false);
  // Manual line item entry
  const [manualDesc, setManualDesc] = useState('');
  const [manualAmount, setManualAmount] = useState('');

  if (currentUser?.role !== Role.ADMIN) {
    return <div className="text-red-500">Only admins can manage invoices.</div>;
  }

  // ---- Filtering ----
  const filtered = useMemo(() => {
    let list = invoices;
    if (statusFilter !== 'all') list = list.filter(inv => inv.status === statusFilter);
    if (search.trim()) {
      list = list.filter(inv =>
        matchesSearch(search, [inv.payerName, inv.invoiceNumber, inv.notes])
      );
    }
    return list;
  }, [invoices, statusFilter, search]);

  // ---- Summary stats (exclude cancelled) ----
  const summaryStats = useMemo(() => {
    const active = invoices.filter(inv => inv.status !== InvoiceStatus.CANCELLED);
    return {
      count: active.length,
      totalAmount: active.reduce((sum, inv) => sum + inv.totalAmount, 0),
      totalPaid: active.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0),
      outstanding: active.reduce((sum, inv) => sum + getInvoiceBalanceDue(inv), 0),
    };
  }, [invoices]);

  // ---- Duplicate detection ----
  const duplicatesForCurrentSelection = useMemo(() => {
    if (!formPayerId || !formPeriodYM) return [];
    const { start, end } = getMonthPeriod(formPeriodYM);
    return invoices.filter(inv =>
      inv.payerId === formPayerId &&
      inv.periodStart === start &&
      inv.periodEnd === end &&
      inv.status !== InvoiceStatus.CANCELLED
    );
  }, [invoices, formPayerId, formPeriodYM]);

  // ---- B2B: generate line items from lessons + school guarantee adjustments ----
  const generateB2BLineItems = (): InvoiceLineItem[] => {
    if (!formPayerId || !formPeriodYM) return [];
    const { start, end } = getMonthPeriod(formPeriodYM);
    const school = schools.find(s => s.id === formPayerId);

    const billableLessons = lessons
      .filter(l =>
        l.schoolId === formPayerId &&
        l.date.substring(0, 10) >= start &&
        l.date.substring(0, 10) <= end &&
        (BILLABLE_STATUSES as readonly string[]).includes(l.status)
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    // Lesson line items (unchanged snapshot logic)
    const items: InvoiceLineItem[] = billableLessons.map(l => ({
      lessonId: l.id,
      date: new Date(l.date).getTime(),
      description: `${l.studentNames.join(', ')} — ${l.type} ${l.durationMinutes}min — ${l.status}`,
      amount: l.schoolRate || 0,
    }));

    // Phase 17.G.1: School guarantee adjustment lines
    // Group billable lessons by date + instrument (normalized), then check school guarantee.
    if (school) {
      const dateInstrMap: Record<string, Record<string, Lesson[]>> = {};
      billableLessons.forEach(l => {
        const date = l.date.substring(0, 10);
        const teacher = teachers.find(t => t.id === l.teacherId);
        const inst = normalizeInstrument(teacher?.instrument || 'unknown');
        if (!dateInstrMap[date]) dateInstrMap[date] = {};
        if (!dateInstrMap[date][inst]) dateInstrMap[date][inst] = [];
        dateInstrMap[date][inst].push(l);
      });

      Object.entries(dateInstrMap).forEach(([date, instruments]) => {
        Object.entries(instruments).forEach(([inst, group]) => {
          const guarantee = resolveSchoolGuarantee(school, inst);
          if (!guarantee) return;

          // actualHours = sum of lessons whose deliveryMode matches appliesTo
          const actualHours = group
            .filter(l => matchesDeliveryMode(guarantee.appliesTo, getDeliveryMode(l)))
            .reduce((sum, l) => sum + (l.durationMinutes || 0) / 60, 0);

          if (actualHours < guarantee.minHours) {
            const shortfall = guarantee.minHours - actualHours;
            const dm = guarantee.appliesTo === 'online_only' ? DeliveryMode.ONLINE : DeliveryMode.IN_PERSON;
            const rate = resolveSchoolRate(school, '', inst, 'Individual', dm);
            const amount = parseFloat((shortfall * rate).toFixed(2));

            // Format: "Guarantee adjustment – Oboe – 25 Mar 2026"
            const dateObj = new Date(date + 'T00:00:00Z');
            const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const instDisplay = inst.charAt(0).toUpperCase() + inst.slice(1);

            items.push({
              date: dateObj.getTime(),
              description: `Guarantee adjustment – ${instDisplay} – ${dateStr}`,
              amount,
            });
          }
        });
      });
    }

    // Sort all items by date (lessons + guarantee adjustments interleaved chronologically)
    items.sort((a, b) => (a.date || 0) - (b.date || 0));

    return items;
  };

  // ---- B2C enrollment: generate line items ----
  const generateB2CEnrollmentLineItems = (): InvoiceLineItem[] => {
    if (!formEnrollmentId) return [];
    const enr = enrollments.find(e => e.id === formEnrollmentId);
    if (!enr) return [];

    const items: InvoiceLineItem[] = [];
    if (enr.priceExpected != null && enr.priceExpected > 0) {
      items.push({
        description: `Enrollment: ${enr.studentName} — ${enr.instrument} — ${enr.totalLessons} lessons × ${enr.durationMinutes}min (${enr.lessonType})`,
        amount: enr.priceExpected,
        date: Date.now(),
      });
    } else {
      // Fall back to summing linked lesson snapshots
      const linked = lessons
        .filter(l => l.enrollmentId === enr.id && (BILLABLE_STATUSES as readonly string[]).includes(l.status))
        .sort((a, b) => a.date.localeCompare(b.date));
      linked.forEach(l => {
        items.push({
          lessonId: l.id,
          date: new Date(l.date).getTime(),
          description: `${l.studentNames.join(', ')} — ${l.type} ${l.durationMinutes}min`,
          amount: l.schoolRate || 0,
        });
      });
      if (items.length === 0) {
        items.push({
          description: `Enrollment: ${enr.studentName} — ${enr.instrument} — ${enr.totalLessons} lessons (no price set, no linked lessons)`,
          amount: 0,
          date: Date.now(),
        });
      }
    }
    return items;
  };

  // ---- Reset form ----
  const resetForm = () => {
    setFormPayerType(InvoicePayerType.SCHOOL);
    setFormPayerId('');
    setFormEnrollmentId('');
    setFormPeriodYM(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
    setFormFromDate('');
    setFormDueDate('');
    setFormAdjustments(0);
    setFormVatEnabled(true);
    setFormVatRate(15);
    setFormNotes('');
    setFormStatus(InvoiceStatus.DRAFT);
    setFormLineItems([]);
    setFormIsLocked(false);
    setManualDesc('');
    setManualAmount('');
    setEditingId(null);
    setShowForm(false);
    setCreateMode('b2b');
  };

  // ---- Generate line items based on mode ----
  const handleGenerate = () => {
    let items: InvoiceLineItem[] = [];
    if (createMode === 'b2b') {
      items = generateB2BLineItems();
    } else if (createMode === 'b2c_enrollment') {
      items = generateB2CEnrollmentLineItems();
    }
    setFormLineItems(items);
  };

  // ---- Add manual line item ----
  const addManualLineItem = () => {
    if (!manualDesc.trim()) return;
    setFormLineItems(prev => [
      ...prev,
      { description: manualDesc.trim(), amount: Number(manualAmount) || 0, date: Date.now() }
    ]);
    setManualDesc('');
    setManualAmount('');
  };

  // ---- Remove line item ----
  const removeLineItem = (index: number) => {
    setFormLineItems(prev => prev.filter((_, i) => i !== index));
  };

  // ---- Computed totals for form preview ----
  const formSubtotal = getInvoiceSubtotal(formLineItems);
  const formVatBase = parseFloat((formSubtotal + (formAdjustments || 0)).toFixed(2));
  const formVatAmount = formVatEnabled
    ? parseFloat((formVatBase * (formVatRate || 0) / 100).toFixed(2))
    : 0;
  const formTotal = parseFloat((formVatBase + formVatAmount).toFixed(2));

  // ---- Start editing ----
  const startEdit = (inv: Invoice) => {
    if (inv.isLocked) {
      if (!window.confirm('This invoice is locked. Unlock and edit?')) return;
    }
    setEditingId(inv.id);
    setFormPayerType(inv.payerType);
    setFormPayerId(inv.payerId);
    setFormEnrollmentId(inv.enrollmentId || '');
    const ym = inv.periodStart ? toYYYYMM(inv.periodStart) : '';
    setFormPeriodYM(ym);
    setFormFromDate(inv.fromDate || '');
    setFormDueDate(inv.dueDate || '');
    setFormAdjustments(inv.adjustments || 0);
    setFormVatEnabled(!!inv.vatRate && inv.vatRate > 0);
    setFormVatRate(inv.vatRate && inv.vatRate > 0 ? inv.vatRate : 15);
    setFormNotes(inv.notes || '');
    setFormStatus(inv.status);
    setFormLineItems(inv.lineItems || []);
    setFormIsLocked(false); // unlocked for editing
    setCreateMode(inv.payerType === InvoicePayerType.SCHOOL ? 'b2b' : (inv.enrollmentId ? 'b2c_enrollment' : 'b2c_manual'));
    setShowForm(true);
  };

  // ---- Submit ----
  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!formPayerId) { alert('Please select a payer.'); return; }
    if (formLineItems.length === 0 && formAdjustments === 0) { alert('Invoice has no line items and no adjustments.'); return; }

    const { start, end } = getMonthPeriod(formPeriodYM);

    // Determine payer name
    let payerName = '';
    if (formPayerType === InvoicePayerType.SCHOOL) {
      payerName = schools.find(s => s.id === formPayerId)?.name || 'Unknown School';
    } else {
      payerName = parents.find(p => p.id === formPayerId)?.name || 'Unknown Parent';
    }

    // Auto-lock when issuing
    const shouldLock = formStatus === InvoiceStatus.ISSUED || formStatus === InvoiceStatus.PAID;

    const subtotal = getInvoiceSubtotal(formLineItems);
    const vatBase = parseFloat((subtotal + (formAdjustments || 0)).toFixed(2));
    const vatRate = formVatEnabled ? (formVatRate || 0) : 0;
    const vatAmount = parseFloat((vatBase * vatRate / 100).toFixed(2));
    const totalAmount = parseFloat((vatBase + vatAmount).toFixed(2));

    const payload: any = {
      payerId: formPayerId,
      payerType: formPayerType,
      payerName,
      enrollmentId: formEnrollmentId || undefined,
      lineItems: formLineItems,
      adjustments: formAdjustments || 0,
      vatRate,
      vatAmount,
      totalAmount,
      paidAmount: 0,
      status: formStatus,
      isLocked: shouldLock,
      periodStart: start,
      periodEnd: end,
      fromDate: formFromDate || undefined,
      issuedDate: formStatus !== InvoiceStatus.DRAFT ? new Date().toISOString().substring(0, 10) : '',
      dueDate: formDueDate || '',
      currency: getCurrency(),
      notes: formNotes || undefined,
      createdBy: currentUser!.id,
    };

    if (editingId) {
      // Preserve original paidAmount, issuedDate if already set
      const existing = invoices.find(inv => inv.id === editingId);
      if (existing) {
        payload.paidAmount = existing.paidAmount || 0;
        if (existing.issuedDate && formStatus !== InvoiceStatus.DRAFT) {
          payload.issuedDate = existing.issuedDate;
        }
      }
      // Recalculate totalAmount in case line items changed
      payload.totalAmount = totalAmount;
      await updateInvoice(editingId, payload);
    } else {
      const result = await addInvoice(payload);
      if (!result.success) { alert(result.message || 'Failed to create invoice.'); return; }
    }

    resetForm();
  };

  // ---- Delete ----
  const handleDelete = async (inv: Invoice) => {
    if (inv.isLocked) {
      if (!window.confirm('This invoice is locked. Delete anyway?')) return;
    }
    if (!window.confirm(`Delete invoice ${inv.invoiceNumber}?`)) return;
    await deleteInvoice(inv.id);
  };

  // ---- Parent payer options: only parents with children ----
  const parentOptions = parents.filter(p => p.childIds && p.childIds.length > 0);

  // ---- Enrollment options for selected parent ----
  const enrollmentOptionsForParent = useMemo(() => {
    if (formPayerType !== InvoicePayerType.PARENT || !formPayerId) return [];
    const parent = parents.find(p => p.id === formPayerId);
    if (!parent) return [];
    return enrollments.filter(e =>
      parent.childIds.includes(e.studentId) && e.status !== 'cancelled'
    );
  }, [formPayerType, formPayerId, parents, enrollments]);

  // ---- Mode change handler ----
  const handleModeChange = (mode: CreateMode) => {
    setCreateMode(mode);
    setFormPayerType(mode === 'b2b' ? InvoicePayerType.SCHOOL : InvoicePayerType.PARENT);
    setFormPayerId('');
    setFormEnrollmentId('');
    setFormLineItems([]);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Invoice Management</h1>
            <p className="text-slate-500 text-sm mt-0.5">Create, track, and manage invoices for schools and parents</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98]"
        >
          + New Invoice
        </button>
      </div>

      {/* Summary Cards (exclude cancelled) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Active Invoices</p>
          <p className="text-2xl font-bold text-white mt-2 tabular-nums">{summaryStats.count}</p>
        </div>
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Total Amount</p>
          <p className="text-2xl font-bold text-white mt-2 tabular-nums">{formatCurrency(summaryStats.totalAmount)}</p>
        </div>
        <div className="bg-slate-900/60 ring-1 ring-emerald-500/10 rounded-2xl p-5">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Total Paid</p>
          <p className="text-2xl font-bold text-emerald-400 mt-2 tabular-nums">{formatCurrency(summaryStats.totalPaid)}</p>
        </div>
        <div className="bg-slate-900/60 ring-1 ring-amber-500/10 rounded-2xl p-5">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Outstanding</p>
          <p className="text-2xl font-bold text-amber-400 mt-2 tabular-nums">{formatCurrency(summaryStats.outstanding)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="Search payer, invoice number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`flex-1 ${inputCls}`}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            {editingId ? 'Edit Invoice' : 'New Invoice'}
          </h2>

          {/* Mode selector (create only) */}
          {!editingId && (
            <div className="flex gap-2 flex-wrap">
              {(['b2b', 'b2c_enrollment', 'b2c_manual'] as CreateMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleModeChange(mode)}
                  className={`px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all ${
                    createMode === mode
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20'
                      : 'bg-slate-800 ring-1 ring-white/10 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {mode === 'b2b' ? 'B2B (School)' : mode === 'b2c_enrollment' ? 'B2C (Enrollment)' : 'B2C (Manual)'}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Payer */}
            <div>
              <label className={labelCls}>
                {formPayerType === InvoicePayerType.SCHOOL ? 'School *' : 'Parent *'}
              </label>
              {formPayerType === InvoicePayerType.SCHOOL ? (
                <select
                  value={formPayerId}
                  onChange={(e) => { setFormPayerId(e.target.value); setFormLineItems([]); }}
                  className={selectCls}
                  required
                >
                  <option value="">Select School</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <select
                  value={formPayerId}
                  onChange={(e) => { setFormPayerId(e.target.value); setFormEnrollmentId(''); setFormLineItems([]); }}
                  className={selectCls}
                  required
                >
                  <option value="">Select Parent</option>
                  {parentOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>

            {/* Enrollment (B2C enrollment mode) */}
            {createMode === 'b2c_enrollment' && (
              <div>
                <label className={labelCls}>Enrollment</label>
                <select
                  value={formEnrollmentId}
                  onChange={(e) => { setFormEnrollmentId(e.target.value); setFormLineItems([]); }}
                  className={selectCls}
                >
                  <option value="">Select Enrollment</option>
                  {enrollmentOptionsForParent.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.studentName} — {e.instrument} — {e.totalLessons} lessons
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Period (Month) — auto-fills periodStart, periodEnd, fromDate */}
            <div>
              <label className={labelCls}>Period (Month)</label>
              <input
                type="month"
                value={formPeriodYM}
                onChange={(e) => {
                  setFormPeriodYM(e.target.value);
                  setFormLineItems([]);
                  // Auto-fill fromDate to first day of selected month
                  if (e.target.value) {
                    const { start } = getMonthPeriod(e.target.value);
                    setFormFromDate(start);
                  }
                }}
                className={inputCls}
              />
            </div>

            {/* From Date */}
            <div>
              <label className={labelCls}>From Date</label>
              <input
                type="date"
                value={formFromDate}
                onChange={(e) => setFormFromDate(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Due Date */}
            <div>
              <label className={labelCls}>Due Date</label>
              <input
                type="date"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Duplicate warning */}
          {duplicatesForCurrentSelection.length > 0 && !editingId && (
            <div className="bg-amber-500/5 ring-1 ring-amber-500/20 rounded-xl p-4">
              <p className="text-amber-400 text-sm font-medium">
                Warning: {duplicatesForCurrentSelection.length} existing invoice(s) found for this payer + period:
              </p>
              <ul className="text-amber-500 text-xs mt-1 space-y-0.5">
                {duplicatesForCurrentSelection.map(d => (
                  <li key={d.id}>{d.invoiceNumber} — {STATUS_LABELS[d.status]} — {formatCurrency(d.totalAmount)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Generate button */}
          {createMode !== 'b2c_manual' && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!formPayerId || (createMode === 'b2c_enrollment' && !formEnrollmentId)}
              className="bg-slate-800 ring-1 ring-white/10 hover:bg-slate-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            >
              {createMode === 'b2b' ? 'Generate from Lessons' : 'Generate from Enrollment'}
            </button>
          )}

          {/* Line items table */}
          {formLineItems.length > 0 && (
            <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/40 text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5 font-medium">Description</th>
                    <th className="text-right px-4 py-2.5 font-medium w-28">Amount</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {formLineItems.map((li, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2 text-slate-300 text-xs">{li.description}</td>
                      <td className="px-4 py-2 text-right text-white tabular-nums">{formatCurrency(li.amount)}</td>
                      <td className="px-1">
                        <button type="button" onClick={() => removeLineItem(i)} className="text-red-500 hover:text-red-400 text-xs px-1">&times;</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Manual line item entry */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className={labelCls}>Add Line Item</label>
              <input
                type="text"
                value={manualDesc}
                onChange={(e) => setManualDesc(e.target.value)}
                placeholder="Description"
                className={inputCls}
              />
            </div>
            <div className="w-28">
              <label className={labelCls}>Amount</label>
              <input
                type="number"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                className={inputCls}
              />
            </div>
            <button
              type="button"
              onClick={addManualLineItem}
              className="bg-slate-800 ring-1 ring-white/10 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            >
              Add
            </button>
          </div>

          {/* Adjustments + VAT + totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className={labelCls}>Adjustments (+/-)</label>
              <input
                type="number"
                value={formAdjustments}
                onChange={(e) => setFormAdjustments(Number(e.target.value))}
                step="0.01"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>VAT</label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formVatEnabled}
                    onChange={(e) => setFormVatEnabled(e.target.checked)}
                    className="h-4 w-4 rounded accent-primary-500"
                  />
                  <span className="text-sm text-slate-300">Add</span>
                </label>
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={formVatRate}
                    onChange={(e) => setFormVatRate(Number(e.target.value))}
                    step="0.1"
                    min="0"
                    disabled={!formVatEnabled}
                    className={`${inputCls} pr-7 disabled:opacity-40`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">%</span>
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={formStatus}
                onChange={(e: any) => setFormStatus(e.target.value)}
                className={selectCls}
              >
                {Object.entries(STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Totals preview */}
          <div className="flex flex-col items-end gap-1 text-sm tabular-nums border-t border-white/5 pt-3">
            <div className="flex justify-between w-full max-w-xs">
              <span className="text-slate-400">Subtotal</span>
              <span className="text-slate-200 font-medium">{formatCurrency(formSubtotal)}</span>
            </div>
            {!!formAdjustments && (
              <div className="flex justify-between w-full max-w-xs">
                <span className="text-slate-400">Adjustments</span>
                <span className="text-slate-200 font-medium">{formatCurrency(formAdjustments)}</span>
              </div>
            )}
            {formVatEnabled && formVatAmount > 0 && (
              <div className="flex justify-between w-full max-w-xs">
                <span className="text-slate-400">VAT ({formVatRate}%)</span>
                <span className="text-slate-200 font-medium">{formatCurrency(formVatAmount)}</span>
              </div>
            )}
            <div className="flex justify-between w-full max-w-xs border-t border-white/10 mt-1 pt-1">
              <span className="text-white font-semibold">Total</span>
              <span className="text-white font-bold">{formatCurrency(formTotal)}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <input
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Optional admin notes"
              className={inputCls}
            />
          </div>

          {/* Lock warning */}
          {(formStatus === InvoiceStatus.ISSUED || formStatus === InvoiceStatus.PAID) && (
            <p className="text-xs text-amber-400/90 bg-amber-500/5 ring-1 ring-amber-500/20 rounded-lg px-3.5 py-2.5">
              Invoice will be locked after saving with status "{STATUS_LABELS[formStatus]}". Editing will require explicit unlock.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
            >
              {editingId ? 'Save Changes' : 'Create Invoice'}
            </button>
            <button type="button" onClick={resetForm} className="bg-slate-800/80 hover:bg-slate-700/80 ring-1 ring-white/10 text-slate-300 px-6 py-2.5 rounded-xl text-sm transition-all">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Invoice List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center text-slate-500 py-12">
            {invoices.length === 0 ? 'No invoices yet.' : 'No invoices match your filters.'}
          </div>
        )}

        {filtered.map(inv => {
          const balanceDue = getInvoiceBalanceDue(inv);
          const subtotal = getInvoiceSubtotal(inv.lineItems || []);
          return (
            <div key={inv.id} className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5 hover:bg-slate-800/40 transition-colors">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Left */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-mono text-sm font-bold">{inv.invoiceNumber}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inv.status]}`}>
                      {STATUS_LABELS[inv.status]}
                    </span>
                    {inv.isLocked && <span className="text-xs text-slate-500">🔒</span>}
                    <span className="text-xs text-slate-600">
                      {inv.payerType === InvoicePayerType.SCHOOL ? 'B2B' : 'B2C'}
                    </span>
                    {inv.vatAmount && inv.vatAmount > 0 ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-lime-400/15 text-lime-300 ring-1 ring-lime-400/30">
                        Tax included
                      </span>
                    ) : null}
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    {inv.payerName}
                    {inv.fromDate && <> &middot; From: {formatDate(inv.fromDate)}</>}
                    {' '}&middot; Period: {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                    {inv.dueDate && <> &middot; Due: {formatDate(inv.dueDate)}</>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {(inv.lineItems || []).length} line items
                    {' '}&middot; Subtotal: {formatCurrency(subtotal)}
                    {inv.adjustments ? ` · Adj: ${formatCurrency(inv.adjustments)}` : ''}
                    {inv.vatAmount && inv.vatAmount > 0 ? ` · VAT (${inv.vatRate}%): ${formatCurrency(inv.vatAmount)}` : ''}
                    {inv.currency && inv.currency !== 'SAR' && ` · ${inv.currency}`}
                  </div>
                  {inv.notes && <div className="text-xs text-slate-600 mt-0.5 italic">{inv.notes}</div>}
                  {/* Phase 17.5: Cross-links */}
                  <div className="flex items-center gap-3 mt-1">
                    {(() => {
                      const payCount = payments.filter(p => p.invoiceId === inv.id).length;
                      if (payCount === 0) return null;
                      return (
                        <button
                          onClick={() => navigate('/admin/payments')}
                          className="text-xs text-primary-400 hover:text-primary-300 underline"
                        >
                          {payCount} payment{payCount !== 1 ? 's' : ''}
                        </button>
                      );
                    })()}
                    {inv.enrollmentId && (
                      <button
                        onClick={() => navigate('/admin/enrollments')}
                        className="text-xs text-primary-400 hover:text-primary-300 underline"
                      >
                        View Enrollment
                      </button>
                    )}
                  </div>
                </div>

                {/* Right: totals + actions */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-white font-bold">{formatCurrency(inv.totalAmount)}</div>
                    {inv.paidAmount > 0 && (
                      <div className="text-xs text-emerald-400">Paid: {formatCurrency(inv.paidAmount)}</div>
                    )}
                    {balanceDue > 0 && inv.status !== InvoiceStatus.CANCELLED && (
                      <div className="text-xs text-amber-400">Due: {formatCurrency(balanceDue)}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => exportInvoiceExcel(inv, lessons, teachers, schools)}
                      className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg transition-colors"
                      title="Export Excel"
                    >Excel</button>
                    <button
                      onClick={() => exportInvoicePDF(inv, lessons, teachers, schools)}
                      className="text-xs bg-blue-500/10 hover:bg-blue-500/20 ring-1 ring-blue-500/20 text-blue-400 px-3 py-1.5 rounded-lg transition-colors"
                      title="Export PDF"
                    >PDF</button>
                    <button
                      onClick={() => startEdit(inv)}
                      className="text-xs bg-slate-800/80 hover:bg-slate-700/80 ring-1 ring-white/10 text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {inv.isLocked ? 'Unlock & Edit' : 'Edit'}
                    </button>
                    <button
                      onClick={() => handleDelete(inv)}
                      className="text-xs bg-red-500/10 hover:bg-red-500/20 ring-1 ring-red-500/20 text-red-400 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
