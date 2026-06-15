/**
 * paymentService.ts — Phase 17.4
 *
 * Payment helpers and invoice reconciliation logic.
 * Keeps computation out of types.ts (which only holds interfaces/enums).
 */

import { Payment, PaymentStatus, Invoice, InvoiceStatus } from '../types';

/**
 * Compute total paid amount for an invoice from its completed payments.
 * Only payments with status === COMPLETED count toward the paid total.
 */
export function getInvoicePaidAmount(payments: Payment[], invoiceId: string): number {
  return parseFloat(
    payments
      .filter(p => p.invoiceId === invoiceId && p.status === PaymentStatus.COMPLETED)
      .reduce((sum, p) => sum + (p.amount || 0), 0)
      .toFixed(2)
  );
}

/**
 * Determine the correct invoice status after a payment change.
 *
 * Rules:
 *   paidAmount >= totalAmount                     → PAID
 *   paidAmount > 0 && paidAmount < totalAmount    → PARTIALLY_PAID
 *   paidAmount === 0 && dueDate past              → OVERDUE
 *   paidAmount === 0 && dueDate future/empty      → ISSUED
 *
 * Does NOT touch draft or cancelled invoices — caller must skip those.
 */
export function resolveInvoiceStatusAfterPayment(
  invoice: Pick<Invoice, 'totalAmount' | 'dueDate' | 'status'>,
  newPaidAmount: number
): { status: InvoiceStatus; isLocked: boolean } {
  if (newPaidAmount >= invoice.totalAmount) {
    return { status: InvoiceStatus.PAID, isLocked: true };
  }
  if (newPaidAmount > 0) {
    return { status: InvoiceStatus.PARTIALLY_PAID, isLocked: false };
  }
  // paidAmount === 0 — check overdue
  if (invoice.dueDate) {
    const today = new Date().toISOString().substring(0, 10);
    if (invoice.dueDate < today) {
      return { status: InvoiceStatus.OVERDUE, isLocked: false };
    }
  }
  // Fall back to issued (was previously paid/partially paid, now reverted)
  return { status: InvoiceStatus.ISSUED, isLocked: false };
}
