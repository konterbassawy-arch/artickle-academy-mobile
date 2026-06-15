/**
 * ParentBilling — Phase 17.5
 *
 * Parent billing page showing:
 * - Own B2C invoices (payerType=parent, payerId=self)
 * - Payment status per invoice
 * - No teacher rates, no admin notes, no createdBy
 *
 * Data is Firestore-filtered at query level (AppContext) + client-stripped as secondary safety.
 */

import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  InvoiceStatus,
  PaymentStatus,
  Role,
  getInvoiceBalanceDue,
  getInvoiceSubtotal
} from '../../types';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]:          'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20',
  [InvoiceStatus.ISSUED]:         'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
  [InvoiceStatus.PARTIALLY_PAID]: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
  [InvoiceStatus.PAID]:           'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
  [InvoiceStatus.OVERDUE]:        'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
  [InvoiceStatus.CANCELLED]:      'bg-red-900/15 text-red-500 ring-1 ring-red-900/20',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]:          'Draft',
  [InvoiceStatus.ISSUED]:         'Issued',
  [InvoiceStatus.PARTIALLY_PAID]: 'Partial',
  [InvoiceStatus.PAID]:           'Paid',
  [InvoiceStatus.OVERDUE]:        'Overdue',
  [InvoiceStatus.CANCELLED]:      'Cancelled',
};

const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  [PaymentStatus.COMPLETED]: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
  [PaymentStatus.PENDING]:   'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
  [PaymentStatus.REFUNDED]:  'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20',
  [PaymentStatus.FAILED]:    'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]:   'Pending',
  [PaymentStatus.COMPLETED]: 'Completed',
  [PaymentStatus.FAILED]:    'Failed',
  [PaymentStatus.REFUNDED]:  'Refunded',
};

const METHOD_LABELS: Record<string, string> = {
  cash:          'Cash',
  bank_transfer: 'Bank Transfer',
  card:          'Card',
  mada:          'Mada',
  apple_pay:     'Apple Pay',
  other:         'Other',
};

const formatDate = (val: string | number | undefined) => {
  if (!val) return '—';
  const d = typeof val === 'number' ? new Date(val) : new Date(val);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const ParentBilling: React.FC = () => {
  const { currentUser, invoices, payments, formatCurrency } = useApp();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (currentUser?.role !== Role.PARENT) {
    return <div className="text-red-500 text-sm">Access denied.</div>;
  }

  // Invoices already Firestore-filtered to payerId=self + payerType=parent
  // Secondary safety: verify payerType
  const myInvoices = useMemo(() =>
    invoices.filter(inv => inv.payerType === 'parent'),
    [invoices]
  );

  // Payments already filtered to match visible invoiceIds
  const paymentsByInvoice = useMemo(() => {
    const map: Record<string, typeof payments> = {};
    for (const p of payments) {
      if (!map[p.invoiceId]) map[p.invoiceId] = [];
      map[p.invoiceId].push(p);
    }
    return map;
  }, [payments]);

  // Summary
  const totalOwed = useMemo(() =>
    myInvoices
      .filter(inv => inv.status !== InvoiceStatus.CANCELLED && inv.status !== InvoiceStatus.DRAFT)
      .reduce((sum, inv) => sum + getInvoiceBalanceDue(inv), 0),
    [myInvoices]
  );

  const paidCount = myInvoices.filter(inv => inv.status === InvoiceStatus.PAID).length;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">My Billing</h1>
        <p className="text-slate-500 text-sm mt-1">Your invoices and payment history</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total invoices */}
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-xl p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Total Invoices</p>
          <p className="text-2xl font-bold text-white tabular-nums">{myInvoices.length}</p>
        </div>

        {/* Outstanding — amber accent if non-zero */}
        <div className={`rounded-xl p-4 ${
          totalOwed > 0
            ? 'bg-amber-500/8 ring-1 ring-amber-500/20 border border-amber-500/15'
            : 'bg-slate-900/60 ring-1 ring-white/5'
        }`}>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Outstanding Balance</p>
          <p className={`text-2xl font-bold tabular-nums ${totalOwed > 0 ? 'text-amber-400' : 'text-white'}`}>
            {formatCurrency(totalOwed)}
          </p>
        </div>

        {/* Paid */}
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-xl p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Paid Invoices</p>
          <p className="text-2xl font-bold text-emerald-400 tabular-nums">{paidCount}</p>
        </div>
      </div>

      {/* Invoice list */}
      {myInvoices.length === 0 ? (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-10 text-center">
          <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-slate-500 text-sm">No invoices yet.</p>
          <p className="text-slate-600 text-xs mt-1">Your billing information will appear here.</p>
        </div>
      ) : (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden divide-y divide-slate-800/60">
          {myInvoices.map(inv => {
            const balance = getInvoiceBalanceDue(inv);
            const invPayments = paymentsByInvoice[inv.id] || [];
            const isExpanded = expandedId === inv.id;

            return (
              <div key={inv.id} className="overflow-hidden">
                {/* Invoice row — clickable header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                  className="w-full px-4 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-left hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white font-mono text-sm font-medium">{inv.invoiceNumber}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[inv.status]}`}>
                      {STATUS_LABELS[inv.status]}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-500 text-xs tabular-nums">Due {formatDate(inv.dueDate)}</span>
                    <span className="text-white font-semibold tabular-nums">{formatCurrency(inv.totalAmount)}</span>
                    {balance > 0 && (
                      <span className="text-amber-400 font-medium text-xs tabular-nums">
                        {formatCurrency(balance)} due
                      </span>
                    )}
                    {/* Chevron */}
                    <svg
                      className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="bg-slate-950/30 border-t border-slate-800/60 px-4 py-4 space-y-5">
                    {/* Period */}
                    <p className="text-xs text-slate-500">
                      Period: <span className="text-slate-300">{formatDate(inv.periodStart)} — {formatDate(inv.periodEnd)}</span>
                    </p>

                    {/* Line items */}
                    {inv.lineItems && inv.lineItems.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Items</p>
                        <div className="bg-slate-900/40 ring-1 ring-white/5 rounded-xl overflow-hidden divide-y divide-slate-800/60">
                          {inv.lineItems.map((li, i) => (
                            <div key={i} className="flex justify-between items-center px-3.5 py-2.5 text-sm">
                              <span className="text-slate-300">{li.description}</span>
                              <span className="text-white tabular-nums">{formatCurrency(li.amount)}</span>
                            </div>
                          ))}

                          {inv.adjustments !== 0 && (
                            <div className="flex justify-between items-center px-3.5 py-2.5 text-sm">
                              <span className="text-slate-400">Adjustments</span>
                              <span className={`tabular-nums ${inv.adjustments > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {formatCurrency(inv.adjustments)}
                              </span>
                            </div>
                          )}

                          <div className="flex justify-between items-center px-3.5 py-2.5 text-sm font-semibold bg-slate-800/30">
                            <span className="text-white">Total</span>
                            <span className="text-white tabular-nums">{formatCurrency(inv.totalAmount)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Payments */}
                    {invPayments.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Payments</p>
                        <div className="space-y-2">
                          {invPayments.map(pay => (
                            <div key={pay.id}
                              className="bg-slate-900/40 ring-1 ring-white/5 rounded-xl px-3.5 py-2.5 flex justify-between items-center">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="text-sm text-white font-semibold tabular-nums">{formatCurrency(pay.amount)}</span>
                                <span className="text-xs text-slate-500">{METHOD_LABELS[pay.method] || pay.method}</span>
                                <span className="text-xs text-slate-600 tabular-nums">{formatDate(pay.paidAt)}</span>
                              </div>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PAYMENT_STATUS_COLORS[pay.status]}`}>
                                {PAYMENT_STATUS_LABELS[pay.status]}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {invPayments.length === 0 && inv.status !== InvoiceStatus.PAID && (
                      <p className="text-xs text-slate-600 italic">No payments recorded yet.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
