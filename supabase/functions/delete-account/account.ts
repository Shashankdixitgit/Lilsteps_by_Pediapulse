// The work behind delete-account, kept apart from the HTTP handler so it
// can be tested with a fake client and a fake Razorpay.
//
//   settleConsultsBeforeDelete: every consult of the account that has not
//     started yet, and every unpaid hold, is cancelled through the same code
//     as consult-payment `cancel` (_shared/consultCancel.ts), with the SAME
//     refund rules as a parent's own cancel: in full when it starts 2 hours
//     or more from now, or when the doctor moved it in the last 24 hours;
//     otherwise no refund. A paid consult whose start time has passed is not
//     cancelled or refunded at all (it may have taken place; the account
//     deletion removes it). Refunds this account was still owed (refund_due / refund_failed) are
//     tried again too: once the account is gone nobody would retry them.
//     A refund that fails does not stop the deletion: its payments row stays
//     refund_failed (parent_id becomes null through the FK) and the team is
//     emailed once (refundAlerts.ts, awaited so the consult time is still
//     there to put in the email).
//   deleteAccountData: files, notification_log rows, the parents row and the
//     auth user, as before.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { cancelConsult, type CancellableConsult } from '../_shared/consultCancel.ts';
import { refundPaymentRow } from '../_shared/razorpay.ts';
import { consultStart } from '../_shared/schedule.ts';

export interface SettleSummary {
  /** Upcoming consults and unpaid holds cancelled. */
  cancelled: number;
  /** Cancelled under 2 hours before the start: not refunded (refund policy). */
  lateNotRefunded: number;
  /** Refunds started (paid consults and money still owed). */
  refundsStarted: number;
  /** Refunds Razorpay refused / didn't answer: left refund_failed, team alerted. */
  refundsFailed: number;
}

/** Shown to the parent when a refund could not be started (the team is emailed). */
export const REFUND_FAILED_NOTICE =
  "We couldn't start the refund for a cancelled consult automatically. Our team has been told and will refund it in full by hand. Questions? Write to dev@lilstepsclinics.com.";

/** A consult that changed under us (paid / expired a moment ago) is read again, this many times. */
const MAX_CANCEL_TRIES = 3;

export async function settleConsultsBeforeDelete(
  admin: SupabaseClient,
  uid: string,
  opts: { now?: number } = {},
): Promise<SettleSummary> {
  const summary: SettleSummary = { cancelled: 0, lateNotRefunded: 0, refundsStarted: 0, refundsFailed: 0 };
  const now = opts.now ?? Date.now();
  const columns = 'id, date, time, status, last_rescheduled_by, rescheduled_at';

  // Money this account was already owed back (read BEFORE cancelling, so a
  // refund that fails just below is not tried twice in one go). A payment
  // that lands after the cancel is refunded by the webhook as usual.
  const { data: owed, error: owedErr } = await admin
    .from('payments')
    .select('id, refund_reason')
    .eq('parent_id', uid)
    .in('status', ['refund_due', 'refund_failed']);
  if (owedErr) throw new Error(`payments: ${owedErr.message}`);

  const { data: open, error } = await admin
    .from('appointments')
    .select(columns)
    .eq('parent_id', uid)
    .in('status', ['upcoming', 'awaiting_payment']);
  if (error) throw new Error(`appointments: ${error.message}`);

  for (const first of (open ?? []) as CancellableConsult[]) {
    let appt: CancellableConsult | null = first;
    for (let attempt = 0; appt && attempt < MAX_CANCEL_TRIES; attempt++) {
      // A paid consult that has started (or is over) is left alone: no
      // cancel, no refund. Unpaid holds are always dropped.
      if (appt.status === 'upcoming' && consultStart(appt.date, appt.time).getTime() <= now) break;
      const r = await cancelConsult(admin, appt, {
        by: 'parent',
        refundReason: 'account_deleted',
        awaitAlert: true,
        now,
      });
      if (r.done) {
        summary.cancelled++;
        if (r.late) summary.lateNotRefunded++;
        if (r.refund === 'started') summary.refundsStarted++;
        if (r.refund === 'failed') summary.refundsFailed++;
        break;
      }
      if (r.why !== 'changed') break;
      const id: string = appt.id;
      const { data: fresh } = await admin.from('appointments').select(columns).eq('id', id).maybeSingle();
      appt = (fresh as unknown as CancellableConsult | null) ?? null;
    }
  }

  for (const p of (owed ?? []) as Array<{ id: string; refund_reason: string | null }>) {
    const r = await refundPaymentRow(admin, p.id, p.refund_reason ?? 'account_deleted', { awaitAlert: true });
    if (r === 'refund_failed') summary.refundsFailed++;
    else if (r === 'refunded' || r === 'refund_pending') summary.refundsStarted++;
  }
  return summary;
}

/** Every object path under `prefix` in `bucket` (walks sub-folders). */
async function listAll(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const queue = [prefix];
  while (queue.length) {
    const folder = queue.shift()!;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(folder, { limit: 1000, offset });
      if (error) throw new Error(`list ${bucket}/${folder}: ${error.message}`);
      if (!data?.length) break;
      for (const item of data) {
        const path = `${folder}/${item.name}`;
        // Folders come back with a null id.
        if (item.id === null) queue.push(path);
        else out.push(path);
      }
      if (data.length < 1000) break;
    }
  }
  return out;
}

async function removeAll(admin: SupabaseClient, bucket: string, paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(unique.slice(i, i + 100));
    if (error) throw new Error(`remove ${bucket}: ${error.message}`);
  }
  return unique.length;
}

/** A stored path, never a full URL (old rows may hold a file:// or https URL). */
function asObjectPath(v: string | null | undefined): string | null {
  if (!v || /^[a-z]+:\/\//i.test(v)) return null;
  return v.replace(/^\/+/, '');
}

export interface DeleteSummary {
  children: number;
  files: number;
}

/** Files, notification_log rows, the parents row (cascades) and the auth user. */
export async function deleteAccountData(admin: SupabaseClient, uid: string): Promise<DeleteSummary> {
  const { data: kids, error: kidsErr } = await admin
    .from('children')
    .select('id')
    .eq('parent_id', uid);
  if (kidsErr) throw new Error(`children: ${kidsErr.message}`);
  const childIds = (kids ?? []).map((k) => k.id as string);

  // ── 1. Storage files ────────────────────────────────────────────────
  const docPaths = await listAll(admin, 'documents', uid);
  const photoPaths = await listAll(admin, 'health-photos', uid);
  let rxPaths: string[] = [];
  if (childIds.length) {
    const [{ data: docs }, { data: notes }, { data: rx }] = await Promise.all([
      admin.from('documents').select('file_url').in('child_id', childIds),
      admin.from('health_notes').select('photo_url').in('child_id', childIds),
      admin.from('prescriptions').select('id, pdf_url').in('child_id', childIds),
    ]);
    // Files referenced from rows but stored outside the parent's folder.
    for (const d of docs ?? []) {
      const p = asObjectPath(d.file_url as string | null);
      if (p) docPaths.push(p);
    }
    for (const n of notes ?? []) {
      const p = asObjectPath(n.photo_url as string | null);
      if (p) photoPaths.push(p);
    }
    for (const r of rx ?? []) {
      rxPaths.push(...(await listAll(admin, 'prescriptions', r.id as string)));
      const p = asObjectPath(r.pdf_url as string | null);
      if (p) rxPaths.push(p);
    }
  }
  rxPaths = [...new Set(rxPaths)];
  const files =
    (await removeAll(admin, 'documents', docPaths)) +
    (await removeAll(admin, 'health-photos', photoPaths)) +
    (await removeAll(admin, 'prescriptions', rxPaths));

  // ── 2. Notification log (phone / push token) ───────────────────────
  const { error: logErr } = await admin.from('notification_log').delete().eq('parent_id', uid);
  if (logErr) throw new Error(`notification_log: ${logErr.message}`);
  if (childIds.length) {
    const { error: logErr2 } = await admin
      .from('notification_log')
      .delete()
      .in('child_id', childIds);
    if (logErr2) throw new Error(`notification_log (children): ${logErr2.message}`);
  }

  // ── 3. Rows: delete the parent explicitly first so a failure here is
  //    caught before the login disappears, then the auth user. ─────────
  const { error: parentErr } = await admin.from('parents').delete().eq('id', uid);
  if (parentErr) throw new Error(`parents: ${parentErr.message}`);

  const { error: authErr } = await admin.auth.admin.deleteUser(uid);
  if (authErr) throw new Error(`auth user: ${authErr.message}`);

  return { children: childIds.length, files };
}
