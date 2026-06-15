
import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Payment,
  PaymentStatus,
  PaymentMethod,
  InvoiceStatus,
  Role,
  getInvoiceBalanceDue
} from '../../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'bg-amber-500/20 text-amber-400',
  [PaymentStatus.COMPLETED]: 'bg-emerald-500/20 text-emerald-400',
  [PaymentStatus.FAILED]: 'bg-red-500/20 text-red-400',
  [PaymentStatus.REFUNDED]: 'bg-purple-500/20 text-purple-400',
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Pending',
  [PaymentStatus.COMPLETED]: 'Completed',
  [PaymentStatus.FAILED]: 'Failed',
  [PaymentStatus.REFUNDED]: 'Refunded',
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Cash',
  [PaymentMethod.BANK_TRANSFER]: 'Bank Transfer',
  [PaymentMethod.CARD]: 'Card',
  [PaymentMethod.MADA]: 'Mada',
  [PaymentMethod.APPLE_PAY]: 'Apple Pay',
  [PaymentMethod.OTHER]: 'Other',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDate = (ts: number | undefined) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatCurrencyLocal = (amount: number, symbol: string) =>
  `${symbol} ${amount.toFixed(2)}`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PaymentManagement: React.FC = () => {
  const {
    currentUser,
    payments,
    invoices,
    addPayment,
    updatePayment,
    deletePayment,
    formatCurrency,
    getCurrencySymbol,
  } = useApp();

  // ---- UI state ----
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ---- Form state ----
  const [formInvoiceId, setFormInvoiceId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState<PaymentMethod>(PaymentMethod.BANK_TRANSFER);
  const [formStatus, setFormStatus] = useState<PaymentStatus>(PaymentStatus.COMPLETED);
  const [formReference, setFormReference] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPaidAt, setFormPaidAt] = useState('');

  if (currentUser?.role !== Role.ADMIN) {
    return <div className="text-red-500">Only admins can manage payments.</div>;
  }

  const currencySymbol = getCurrencySymbol();

  // ---- Payable invoices (not draft, not cancelled) ----
  const payableInvoices = useMemo(() =>
    invoices.filter(inv =>
      inv.status !== InvoiceStatus.DRAFT &&
      inv.status !== InvoiceStatus.CANCELLED
    ).sort((a, b) => b.createdAt - a.createdAt),
    [invoices]
  );

  // ---- Filtering ----
  const filtered = useMemo(() => {
    let list = payments;
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.invoiceNumber.toLowerCase().includes(q) ||
        p.payerName.toLowerCase().includes(q) ||
        (p.reference || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [payments, statusFilter, search]);

  // ---- Selected invoice info ----
  const selectedInvoice = useMemo(() =>
    invoices.find(inv => inv.id === formInvoiceId),
    [invoices, formInvoiceId]
  );

  const selectedInvoiceBalance = useMemo(() => {
    if (!selectedInvoice) return 0;
    return getInvoiceBalanceDue(selectedInvoice);
  }, [selectedInvoice]);

  // ---- Reset form ----
  const resetForm = () => {
    setFormInvoiceId('');
    setFormAmount('');
    setFormMethod(PaymentMethod.BANK_TRANSFER);
    setFormStatus(PaymentStatus.COMPLETED);
    setFormReference('');
    setFormNotes('');
    setFormPaidAt('');
    setEditingId(null);
    setShowForm(false);
  };

  // ---- Open edit ----
  const openEdit = (p: Payment) => {
    setEditingId(p.id);
    setFormInvoiceId(p.invoiceId);
    setFormAmount(String(p.amount));
    setFormMethod(p.method);
    setFormStatus(p.status);
    setFormReference(p.reference || '');
    setFormNotes(p.notes || '');
    setFormPaidAt(p.paidAt ? new Date(p.paidAt).toISOString().substring(0, 10) : '');
    setShowForm(true);
  };

  // ---- Open create with pre-selected invoice ----
  const openCreateForInvoice = (invoiceId: string) => {
    resetForm();
    setFormInvoiceId(invoiceId);
    const inv = invoices.find(i => i.id === invoiceId);
    if (inv) {
      const balance = getInvoiceBalanceDue(inv);
      setFormAmount(balance > 0 ? balance.toFixed(2) : '');
    }
    setShowForm(true);
  };

  // ---- Submit ----
  const handleSubmit = async () => {
    if (!formInvoiceId) return alert('Please select an invoice.');
    const amount = parseFloat(formAmount);
    if (isNaN(amount) || amount <= 0) return alert('Amount must be positive.');

    const invoice = invoices.find(inv => inv.id === formInvoiceId);
    if (!invoice) return alert('Invoice not found.');

    const paidAtTs = formPaidAt ? new Date(formPaidAt + 'T00:00:00Z').getTime() : undefined;

    if (editingId) {
      // Update existing
      await updatePayment(editingId, {
        invoiceId: formInvoiceId,
        invoiceNumber: invoice.invoiceNumber,
        payerName: invoice.payerName,
        amount,
        method: formMethod,
        status: formStatus,
        reference: formReference || undefined,
        notes: formNotes || undefined,
        paidAt: paidAtTs,
      });
    } else {
      // Create new
      const result = await addPayment({
        invoiceId: formInvoiceId,
        invoiceNumber: invoice.invoiceNumber,
        payerName: invoice.payerName,
        amount,
        method: formMethod,
        status: formStatus,
        reference: formReference || undefined,
        notes: formNotes || undefined,
        paidAt: paidAtTs,
        createdBy: currentUser!.id,
      });
      if (!result.success) {
        return alert(result.message || 'Failed to create payment.');
      }
    }

    resetForm();
  };

  // ---- Delete with confirmation ----
  const handleDelete = async (id: string) => {
    const payment = payments.find(p => p.id === id);
    if (!payment) return;

    // Completed payments require explicit double confirmation
    if (payment.status === PaymentStatus.COMPLETED) {
      if (confirmDeleteId !== id) {
        setConfirmDeleteId(id);
        return; // First click — show confirmation
      }
    }

    await deletePayment(id);
    setConfirmDeleteId(null);
  };

  // ---- Summary stats ----
  const totalCompleted = useMemo(() =>
    payments
      .filter(p => p.status === PaymentStatus.COMPLETED)
      .reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const totalPending = useMemo(() =>
    payments
      .filter(p => p.status === PaymentStatus.PENDING)
      .reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  // =====================================================================
  // RENDER
  // =====================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Payments</h1>
          <p className="text-slate-400 text-sm">Phase 17.4 — Record and reconcile payments against invoices</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors text-sm font-medium"
        >
          + Record Payment
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider">Total Payments</p>
          <p className="text-2xl font-bold text-white mt-1">{payments.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider">Completed</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(totalCompleted)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider">Pending</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{formatCurrency(totalPending)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider">Refunded</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">
            {formatCurrency(payments.filter(p => p.status === PaymentStatus.REFUNDED).reduce((s, p) => s + p.amount, 0))}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="Search invoice #, payer, reference..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
        >
          <option value="all">All Statuses</option>
          {Object.values(PaymentStatus).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* ---- CREATE / EDIT FORM ---- */}
      {showForm && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">
            {editingId ? 'Edit Payment' : 'Record Payment'}
          </h2>

          {/* Invoice selector */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Invoice *</label>
            <select
              value={formInvoiceId}
              onChange={e => {
                setFormInvoiceId(e.target.value);
                const inv = invoices.find(i => i.id === e.target.value);
                if (inv && !editingId) {
                  const balance = getInvoiceBalanceDue(inv);
                  setFormAmount(balance > 0 ? balance.toFixed(2) : '');
                }
              }}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              disabled={!!editingId}
            >
              <option value="">— Select invoice —</option>
              {payableInvoices.map(inv => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — {inv.payerName} — Balance: {formatCurrency(getInvoiceBalanceDue(inv))}
                </option>
              ))}
            </select>
          </div>

          {/* Invoice balance info */}
          {selectedInvoice && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Total Amount:</span>
                <span>{formatCurrency(selectedInvoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Paid So Far:</span>
                <span>{formatCurrency(selectedInvoice.paidAmount || 0)}</span>
              </div>
              <div className="flex justify-between font-medium text-white border-t border-slate-600 pt-1 mt-1">
                <span>Balance Due:</span>
                <span className={selectedInvoiceBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                  {formatCurrency(selectedInvoiceBalance)}
                </span>
              </div>
            </div>
          )}

          {/* Amount + Method row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Amount ({currencySymbol}) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Method *</label>
              <select
                value={formMethod}
                onChange={e => setFormMethod(e.target.value as PaymentMethod)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              >
                {Object.values(PaymentMethod).map(m => (
                  <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status + Paid Date row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Status *</label>
              <select
                value={formStatus}
                onChange={e => setFormStatus(e.target.value as PaymentStatus)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              >
                {Object.values(PaymentStatus).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Paid Date {(formStatus === PaymentStatus.COMPLETED || formStatus === PaymentStatus.REFUNDED) ? '*' : '(optional)'}
              </label>
              <input
                type="date"
                value={formPaidAt}
                onChange={e => setFormPaidAt(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Reference (bank ref, transaction ID, receipt #)</label>
            <input
              type="text"
              value={formReference}
              onChange={e => setFormReference(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="e.g. TXN-123456"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Notes</label>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              rows={2}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
              placeholder="Optional notes..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors text-sm font-medium"
            >
              {editingId ? 'Update Payment' : 'Record Payment'}
            </button>
            <button
              onClick={resetForm}
              className="px-5 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ---- PAYMENT TABLE ---- */}
      {filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center">
          <p className="text-slate-500">No payments found.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                <th className="text-left p-3">Invoice</th>
                <th className="text-left p-3">Payer</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-left p-3">Method</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Paid Date</th>
                <th className="text-left p-3">Reference</th>
                <th className="text-left p-3">Created</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="p-3 text-white font-mono text-xs">{p.invoiceNumber}</td>
                  <td className="p-3 text-slate-300">{p.payerName}</td>
                  <td className="p-3 text-right text-white font-medium">{formatCurrency(p.amount)}</td>
                  <td className="p-3 text-slate-300">{METHOD_LABELS[p.method] || p.method}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400 text-xs">{formatDate(p.paidAt)}</td>
                  <td className="p-3 text-slate-400 text-xs font-mono">{p.reference || '—'}</td>
                  <td className="p-3 text-slate-500 text-xs">{formatDate(p.createdAt)}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => openEdit(p)}
                        className="text-xs text-primary-400 hover:text-primary-300"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className={`text-xs ${
                          confirmDeleteId === p.id
                            ? 'text-red-300 font-bold animate-pulse'
                            : 'text-red-500 hover:text-red-400'
                        }`}
                      >
                        {confirmDeleteId === p.id ? 'Confirm Delete?' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
