
import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  PayrollRun,
  PayrollStatus,
  PayrollLineItem,
  Role,
  getPayrollBalanceDue
} from '../../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<PayrollStatus, string> = {
  [PayrollStatus.DRAFT]:          'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20',
  [PayrollStatus.APPROVED]:       'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
  [PayrollStatus.PARTIALLY_PAID]: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
  [PayrollStatus.PAID]:           'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
  [PayrollStatus.CANCELLED]:      'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
};

/** Statuses that count towards summary card totals */
const SUMMARY_STATUSES: PayrollStatus[] = [
  PayrollStatus.APPROVED,
  PayrollStatus.PARTIALLY_PAID,
  PayrollStatus.PAID,
];

const STATUS_LABELS: Record<PayrollStatus, string> = {
  [PayrollStatus.DRAFT]:          'Draft',
  [PayrollStatus.APPROVED]:       'Approved',
  [PayrollStatus.PARTIALLY_PAID]: 'Partial',
  [PayrollStatus.PAID]:           'Paid',
  [PayrollStatus.CANCELLED]:      'Cancelled',
};

const LINE_TYPE_COLORS: Record<string, string> = {
  lesson:            'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
  guarantee:         'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
  manual_adjustment: 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20',
};

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TeacherPayroll: React.FC = () => {
  const {
    currentUser,
    payrollRuns,
    schools,
    formatCurrency,
    getCurrencySymbol,
  } = useApp();

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  if (currentUser?.role !== Role.TEACHER) {
    return <div className="text-red-500 text-sm">Only teachers can view this page.</div>;
  }

  const currencySymbol = getCurrencySymbol();

  // Teacher only sees their own payroll runs (Firestore-filtered)
  // Notes are already stripped by the listener
  const myPayrolls = useMemo(() => {
    let list = [...payrollRuns];
    if (statusFilter !== 'all') {
      list = list.filter(pr => pr.status === statusFilter);
    }
    return list;
  }, [payrollRuns, statusFilter]);

  // Summary (ONLY approved + partially_paid + paid)
  const stats = useMemo(() => {
    const active = payrollRuns.filter(pr => SUMMARY_STATUSES.includes(pr.status));
    const total = active.length;
    const totalPayable = active.reduce((s, pr) => s + pr.totalPayable, 0);
    const totalPaid = active.reduce((s, pr) => s + pr.paidAmount, 0);
    const outstanding = totalPayable - totalPaid;
    return { total, totalPayable, totalPaid, outstanding };
  }, [payrollRuns]);

  const viewingPayroll = viewingId ? payrollRuns.find(pr => pr.id === viewingId) : null;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">My Payroll</h1>
        <p className="text-slate-500 text-sm mt-1">View your payroll history and payment status</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-xl p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Active Runs</p>
          <p className="text-2xl font-bold text-white tabular-nums">{stats.total}</p>
        </div>
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-xl p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Total Earned</p>
          <p className="text-2xl font-bold text-white tabular-nums">{formatCurrencyLocal(stats.totalPayable, currencySymbol)}</p>
        </div>
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-xl p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Received</p>
          <p className="text-2xl font-bold text-emerald-400 tabular-nums">{formatCurrencyLocal(stats.totalPaid, currencySymbol)}</p>
        </div>
        <div className={`rounded-xl p-4 ${
          stats.outstanding > 0
            ? 'bg-amber-500/8 ring-1 ring-amber-500/20 border border-amber-500/15'
            : 'bg-slate-900/60 ring-1 ring-white/5'
        }`}>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Pending</p>
          <p className={`text-2xl font-bold tabular-nums ${stats.outstanding > 0 ? 'text-amber-400' : 'text-white'}`}>
            {formatCurrencyLocal(stats.outstanding, currencySymbol)}
          </p>
        </div>
      </div>

      {/* Filter + count */}
      <div className="flex items-center justify-between gap-4">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500 tabular-nums">
          {myPayrolls.length} run{myPayrolls.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Payroll table */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/40 text-[10px] text-slate-500 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">Payroll #</th>
                <th className="text-left px-5 py-3 font-medium">Period</th>
                <th className="text-right px-5 py-3 font-medium">Total</th>
                <th className="text-right px-5 py-3 font-medium">Paid</th>
                <th className="text-right px-5 py-3 font-medium">Balance</th>
                <th className="text-center px-5 py-3 font-medium">Status</th>
                <th className="text-center px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {myPayrolls.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500 py-10 text-sm">
                    No payroll runs found
                  </td>
                </tr>
              )}
              {myPayrolls.map(pr => {
                const balance = getPayrollBalanceDue(pr);
                return (
                  <tr key={pr.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-300">{pr.payrollNumber}</td>
                    <td className="px-5 py-3.5 text-slate-400 text-xs tabular-nums">
                      {formatDate(pr.periodStart)} – {formatDate(pr.periodEnd)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-white font-medium tabular-nums">{formatCurrency(pr.totalPayable)}</td>
                    <td className="px-5 py-3.5 text-right text-emerald-400 tabular-nums">{formatCurrency(pr.paidAmount)}</td>
                    <td className="px-5 py-3.5 text-right text-amber-400 tabular-nums">{formatCurrency(balance)}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[pr.status] || ''}`}>
                        {STATUS_LABELS[pr.status] || pr.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <button
                        onClick={() => setViewingId(pr.id)}
                        className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                      >View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============ View Detail Modal ============ */}
      {viewingPayroll && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto pt-8 pb-8">
          <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 w-full max-w-3xl mx-4 shadow-2xl shadow-black/40">
            {/* Modal header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">{viewingPayroll.payrollNumber}</h2>
                <p className="text-sm text-slate-500 mt-0.5 tabular-nums">
                  {formatDate(viewingPayroll.periodStart)} – {formatDate(viewingPayroll.periodEnd)}
                </p>
                {viewingPayroll.schoolFilter && (
                  <p className="text-xs text-slate-600 mt-1">
                    School: {schools.find(s => s.id === viewingPayroll.schoolFilter)?.name || viewingPayroll.schoolFilter}
                  </p>
                )}
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${STATUS_COLORS[viewingPayroll.status]}`}>
                {STATUS_LABELS[viewingPayroll.status]}
              </span>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-3.5 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Earned</p>
                <p className="text-lg font-bold text-white tabular-nums">{formatCurrency(viewingPayroll.totalPayable)}</p>
              </div>
              <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-3.5 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Received</p>
                <p className="text-lg font-bold text-emerald-400 tabular-nums">{formatCurrency(viewingPayroll.paidAmount)}</p>
              </div>
              <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-3.5 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Pending</p>
                <p className="text-lg font-bold text-amber-400 tabular-nums">{formatCurrency(getPayrollBalanceDue(viewingPayroll))}</p>
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-xl overflow-hidden mb-6">
              {/* Summary bar */}
              <div className="bg-slate-800/60 px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 border-b border-slate-800/60">
                <span className="tabular-nums">{viewingPayroll.lineItems?.length || 0} line items</span>
                <span className="text-slate-700">·</span>
                <span>Lessons: <span className="text-slate-300 tabular-nums">{formatCurrency(viewingPayroll.lessonTotal)}</span></span>
                <span className="text-slate-700">·</span>
                <span>Guarantee: <span className="text-slate-300 tabular-nums">{formatCurrency(viewingPayroll.guaranteeTotal)}</span></span>
                {(viewingPayroll.manualAdjustmentTotal ?? 0) !== 0 && (
                  <>
                    <span className="text-slate-700">·</span>
                    <span>Manual: <span className="text-slate-300 tabular-nums">{formatCurrency(viewingPayroll.manualAdjustmentTotal || 0)}</span></span>
                  </>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800/30 text-[10px] text-slate-500 uppercase tracking-wider sticky top-0">
                      <th className="text-left px-3.5 py-2 font-medium">Date</th>
                      <th className="text-left px-3.5 py-2 font-medium">Description</th>
                      <th className="text-right px-3.5 py-2 font-medium">Hours</th>
                      <th className="text-right px-3.5 py-2 font-medium">Rate</th>
                      <th className="text-right px-3.5 py-2 font-medium">Amount</th>
                      <th className="text-center px-3.5 py-2 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {(viewingPayroll.lineItems || [])
                      .sort((a: PayrollLineItem, b: PayrollLineItem) => a.date - b.date)
                      .map((line: PayrollLineItem, i: number) => (
                      <tr key={i} className={
                        line.type === 'guarantee' ? 'bg-amber-900/5'
                        : line.type === 'manual_adjustment' ? 'bg-purple-900/5'
                        : ''
                      }>
                        <td className="px-3.5 py-2 text-slate-400 tabular-nums">{formatDate(line.date)}</td>
                        <td className="px-3.5 py-2 text-white max-w-xs truncate">{line.description}</td>
                        <td className="px-3.5 py-2 text-right text-slate-400 tabular-nums">{line.hours.toFixed(2)}</td>
                        <td className="px-3.5 py-2 text-right text-slate-400 tabular-nums">{formatCurrencyLocal(line.rate, currencySymbol)}</td>
                        <td className="px-3.5 py-2 text-right text-white font-medium tabular-nums">{formatCurrencyLocal(line.amount, currencySymbol)}</td>
                        <td className="px-3.5 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${LINE_TYPE_COLORS[line.type] || 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20'}`}>
                            {line.type === 'manual_adjustment' ? 'manual' : line.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Close button */}
            <div className="flex justify-end">
              <button
                onClick={() => setViewingId(null)}
                className="px-5 py-2.5 bg-slate-800 ring-1 ring-white/10 text-slate-300 rounded-xl hover:bg-slate-700 transition-all text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
