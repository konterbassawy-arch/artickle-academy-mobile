/**
 * SchoolInvoices — Phase 17.5
 *
 * School admin invoice view showing:
 * - Own school B2B invoices (payerType=school, payerId=schoolId)
 * - Payment status per invoice
 * - No teacher payroll, no admin notes, no private student billing
 *
 * Data is Firestore-filtered at query level (AppContext):
 *   invoices: where payerId=schoolId AND payerType='school'
 *   payments: filtered client-side to match visible invoiceIds
 * + client-stripped as secondary safety layer.
 */

import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  InvoiceStatus,
  PaymentStatus,
  Role,
  getInvoiceBalanceDue
} from '../../types';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'bg-slate-500/15 text-slate-400 ring-slate-500/20',
  [InvoiceStatus.ISSUED]: 'bg-blue-500/15 text-blue-400 ring-blue-500/20',
  [InvoiceStatus.PARTIALLY_PAID]: 'bg-amber-500/15 text-amber-400 ring-amber-500/20',
  [InvoiceStatus.PAID]: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
  [InvoiceStatus.OVERDUE]: 'bg-red-500/15 text-red-400 ring-red-500/20',
  [InvoiceStatus.CANCELLED]: 'bg-red-900/15 text-red-500 ring-red-500/20',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'Draft',
  [InvoiceStatus.ISSUED]: 'Issued',
  [InvoiceStatus.PARTIALLY_PAID]: 'Partially Paid',
  [InvoiceStatus.PAID]: 'Paid',
  [InvoiceStatus.OVERDUE]: 'Overdue',
  [InvoiceStatus.CANCELLED]: 'Cancelled',
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Pending',
  [PaymentStatus.COMPLETED]: 'Completed',
  [PaymentStatus.FAILED]: 'Failed',
  [PaymentStatus.REFUNDED]: 'Refunded',
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  mada: 'Mada',
  apple_pay: 'Apple Pay',
  other: 'Other',
};

const formatDate = (val: string | number | undefined) => {
  if (!val) return '—';
  const d = typeof val === 'number' ? new Date(val) : new Date(val);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const SchoolInvoices: React.FC = () => {
  const { currentUser, invoices, payments, schools, formatCurrency } = useApp();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  if (currentUser?.role !== Role.SCHOOL_ADMIN) {
    return <div className="text-red-500">Access denied.</div>;
  }

  const school = schools[0]; // School admin sees only own school

  // Invoices already Firestore-filtered to payerId=schoolId + payerType=school
  // Secondary safety: verify payerType AND payerId match
  const myInvoices = useMemo(() => {
    let list = invoices.filter(inv =>
      inv.payerType === 'school' && (school ? inv.payerId === school.id : false)
    );
    if (statusFilter !== 'all') list = list.filter(inv => inv.status === statusFilter);
    return list;
  }, [invoices, school, statusFilter]);

  // Payments already filtered in AppContext to match visible invoiceIds
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

  if (!school) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">School Not Found</h2>
          <p className="text-slate-500 text-sm">Your account is not linked to a school.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Invoices</h2>
        <p className="text-sm text-slate-500 mt-1">{school.name} — Billing history and payment status</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Total Invoices</p>
          <p className="text-2xl font-bold text-white">{myInvoices.length}</p>
        </div>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Outstanding</p>
          <p className="text-2xl font-bold text-amber-400">{formatCurrency(totalOwed)}</p>
        </div>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Paid</p>
          <p className="text-2xl font-bold text-emerald-400">
            {myInvoices.filter(inv => inv.status === InvoiceStatus.PAID).length}
          </p>
        </div>
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Overdue</p>
          <p className="text-2xl font-bold text-red-400">
            {myInvoices.filter(inv => inv.status === InvoiceStatus.OVERDUE).length}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-primary-500/50"
        >
          <option value="all">All Statuses</option>
          {Object.values(InvoiceStatus).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* Invoice list */}
      {myInvoices.length === 0 ? (
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-10 text-center">
          <p className="text-slate-500 text-sm">No invoices found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {myInvoices.map(inv => {
            const balance = getInvoiceBalanceDue(inv);
            const invPayments = paymentsByInvoice[inv.id] || [];
            const isExpanded = expandedId === inv.id;

            return (
              <div key={inv.id} className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden hover:border-slate-700 transition-colors">
                {/* Invoice header (clickable) */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                  className="w-full p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-left hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white font-mono text-sm font-semibold">{inv.invoiceNumber}</span>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ring-1 ${STATUS_COLORS[inv.status]}`}>
                      {STATUS_LABELS[inv.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-5 text-sm">
                    <span className="text-slate-500 text-xs">
                      {formatDate(inv.periodStart)} — {formatDate(inv.periodEnd)}
                    </span>
                    <span className="text-slate-500 text-xs">Due: {formatDate(inv.dueDate)}</span>
                    <span className="text-white font-semibold tabular-nums">{formatCurrency(inv.totalAmount)}</span>
                    {balance > 0 && (
                      <span className="text-amber-400 font-medium text-xs tabular-nums">Due: {formatCurrency(balance)}</span>
                    )}
                    <svg className={`w-4 h-4 text-slate-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-slate-800 p-4 space-y-4 bg-slate-950/30">
                    {/* Line items */}
                    {inv.lineItems && inv.lineItems.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Line Items</p>
                        <div className="bg-slate-900/60 rounded-lg border border-slate-800 p-3 space-y-1.5">
                          {inv.lineItems.map((li, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-slate-300">{li.description}</span>
                              <span className="text-white tabular-nums">{formatCurrency(li.amount)}</span>
                            </div>
                          ))}
                          {inv.adjustments !== 0 && (
                            <div className="flex justify-between text-sm border-t border-slate-800 pt-1.5 mt-1.5">
                              <span className="text-slate-400">Adjustments</span>
                              <span className={`tabular-nums ${inv.adjustments > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {formatCurrency(inv.adjustments)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-semibold border-t border-slate-700 pt-2 mt-2">
                            <span className="text-white">Total</span>
                            <span className="text-white tabular-nums">{formatCurrency(inv.totalAmount)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Payments */}
                    {invPayments.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Payments</p>
                        <div className="space-y-1.5">
                          {invPayments.map(pay => (
                            <div key={pay.id} className="bg-slate-900/60 rounded-lg border border-slate-800 p-3 flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-white font-semibold tabular-nums">{formatCurrency(pay.amount)}</span>
                                <span className="text-[11px] text-slate-500">{METHOD_LABELS[pay.method] || pay.method}</span>
                                <span className="text-[11px] text-slate-600">{formatDate(pay.paidAt)}</span>
                              </div>
                              <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ring-1 ${
                                pay.status === PaymentStatus.COMPLETED ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
                                  : pay.status === PaymentStatus.PENDING ? 'bg-amber-500/15 text-amber-400 ring-amber-500/20'
                                  : pay.status === PaymentStatus.REFUNDED ? 'bg-violet-500/15 text-violet-400 ring-violet-500/20'
                                  : 'bg-red-500/15 text-red-400 ring-red-500/20'
                              }`}>
                                {PAYMENT_STATUS_LABELS[pay.status]}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {invPayments.length === 0 && inv.status !== InvoiceStatus.PAID && (
                      <p className="text-xs text-slate-600 italic">No payments recorded for this invoice.</p>
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
