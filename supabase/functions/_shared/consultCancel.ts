// Cancelling a consult or an unpaid hold, with its refund. Shared by
// consult-payment `cancel` (parent / doctor) and delete-account (every
// not-yet-started consult of the account, as a parent cancel).
//
//   • The booking is set 'cancelled' only if it is still in the state we
//     read (a parallel cancel / payment / expiry wins otherwise: 'changed').
//   • Open Payment Links are cancelled so they can't take money for a
//     cancelled booking (if one was paid a moment ago, the webhook finds the
//     booking cancelled and refunds it).
//   • A paid consult is refunded by refundPaymentRow (claim first, then
//     Razorpay; a failure leaves refund_failed and alerts the team).
//     Refund rules: in full when 2 h or more before the start, when the
//     doctor cancels, or when the doctor moved it in the last 24 h;
//     otherwise none for a late parent cancel. There is deliberately no
//     "always refund" switch: account deletion uses the same rules.
//   • A consult booked with a Care Plan credit (0053) follows the same
//     lines, with the plan consult instead of money: it goes back to the
//     plan (return_plan_credit) when cancelled 2 h or more before, by the
//     doctor, or after a doctor's move in the last 24 h; otherwise it is
//     used. After that billing month has ended a credit can't go back to
//     it: a DOCTOR cancel then means 'rebook_owed' (the team is emailed to
//     book a free consult, refund policy); a PARENT cancel (incl. account
//     deletion) means 'expired' — the month is over and nothing is owed, so
//     booking at a month's end and cancelling in the next one gains nothing.
//
// Who may cancel what is the caller's job; this only does it.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { alertRebookOwed, type PlanCreditOutcome, returnPlanCredit } from './carePlan.ts';
import { inBackground } from './parentNotify.ts';
import { cancelPaymentLink, REFUND_CUTOFF_MS, refundPaymentRow } from './razorpay.ts';
import { consultStart, doctorMovedRecently } from './schedule.ts';

export interface CancellableConsult {
  id: string;
  date: string;
  time: string;
  status: string;
  last_rescheduled_by?: string | null;
  rescheduled_at?: string | null;
}

export type CancelRefund = 'none' | 'not_paid' | 'started' | 'failed';

export type CancelResult =
  | { done: true; refund: CancelRefund; late?: true; plan?: PlanCreditOutcome }
  | { done: false; why: 'already_cancelled' | 'not_cancellable' | 'changed' };

export interface CancelOptions {
  by: 'parent' | 'doctor';
  /** payments.refund_reason; default doctor_cancelled / parent_cancelled. */
  refundReason?: string;
  /** Wait for a refund-failure alert (see RefundOptions.awaitAlert). */
  awaitAlert?: boolean;
  now?: number;
}

export async function cancelConsult(
  admin: SupabaseClient,
  appt: CancellableConsult,
  opts: CancelOptions,
): Promise<CancelResult> {
  if (appt.status === 'cancelled') return { done: false, why: 'already_cancelled' };
  if (appt.status !== 'upcoming' && appt.status !== 'awaiting_payment') return { done: false, why: 'not_cancellable' };

  const { data: updated } = await admin
    .from('appointments')
    .update({ status: 'cancelled', cancel_reason: opts.by, hold_expires_at: null })
    .eq('id', appt.id)
    .eq('status', appt.status)
    .select('id')
    .maybeSingle();
  if (!updated) return { done: false, why: 'changed' };

  const { data: rows } = await admin
    .from('payments')
    .select('id, status, razorpay_link_id')
    .eq('appointment_id', appt.id);
  const payments = (rows ?? []) as Array<{ id: string; status: string; razorpay_link_id: string | null }>;

  for (const p of payments) {
    if (p.status === 'created' && p.razorpay_link_id) {
      await cancelPaymentLink(p.razorpay_link_id);
      await admin
        .from('payments')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', p.id)
        .eq('status', 'created');
    }
  }

  const early = consultStart(appt.date, appt.time).getTime() - (opts.now ?? Date.now()) >= REFUND_CUTOFF_MS;
  // Late, but the doctor moved this consult in the last 24 hours: the new
  // time may not suit the family, so they still get their money back.
  const giveBack =
    opts.by === 'doctor' || early || doctorMovedRecently(appt.last_rescheduled_by, appt.rescheduled_at, opts.now);

  const paid = payments.find((p) => p.status === 'paid');
  if (!paid) {
    if (appt.status !== 'upcoming') return { done: true, refund: 'not_paid' };
    const { data: use } = await admin
      .from('care_plan_credit_uses')
      .select('id')
      .eq('appointment_id', appt.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!use) return { done: true, refund: 'not_paid' };
    if (!giveBack) return { done: true, refund: 'none', late: true, plan: 'used' };
    const back = await returnPlanCredit(admin, appt.id, opts.by);
    if (back === 'expired') return { done: true, refund: 'not_paid', plan: 'expired' };
    if (back === 'rebook_owed') {
      inBackground('rebook alert', alertRebookOwed(appt.id, { date: appt.date, time: appt.time }));
      return { done: true, refund: 'not_paid', plan: 'rebook_owed' };
    }
    return { done: true, refund: 'not_paid', plan: 'returned' };
  }

  if (!giveBack) return { done: true, refund: 'none', late: true };

  const reason = opts.refundReason ?? (opts.by === 'doctor' ? 'doctor_cancelled' : 'parent_cancelled');
  const result = await refundPaymentRow(admin, paid.id, reason, { awaitAlert: opts.awaitAlert });
  if (result === 'not_paid') return { done: true, refund: 'not_paid' };
  return { done: true, refund: result === 'refund_failed' ? 'failed' : 'started' };
}
