// LilSteps Care Plan: ₹999 a month for 3 video consults per billing month,
// on a Razorpay Subscription. Shared by the care-plan edge function (the
// parent's Subscribe / status / Cancel), razorpay-webhook (subscription.*
// events) and delete-account (stop billing before the account goes).
//
// Source of truth: Razorpay. Our care_plans row mirrors the subscription's
// status and dates (0053); credits come only from a PAID month
// (care_plan_periods, one per subscription.charged), so a renewal that
// failed never gives credits for the new month.
//
// The Razorpay Plan (₹999, period monthly, interval 1) is created once per
// Razorpay account (live and test each have their own) and its id is set as
// the RAZORPAY_CARE_PLAN_ID secret. See the PR's deploy steps.
//
// Webhook ordering: Razorpay does not promise events arrive in order. Each
// status change carries the event's created_at (unix seconds); an older
// event never overwrites a newer state (care_plans.last_event_at), a final
// state (cancelled / completed / expired) is never left, and between two
// events of the same second the one further along wins
// (created < authenticated < active / pending / halted < final).
// A paid month is recorded by subscription.charged whatever order it
// arrives in (idempotent: one period per plan and start).
//
// Emails (generic subjects, no child details; one per plan_key, 0053 index):
//   care_plan_started         first paid month recorded
//   care_plan_renewed         each later paid month
//   care_plan_payment_failed  status became pending or halted
//   care_plan_cancelled       parent cancelled (ends on …), or Razorpay ended it

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { type EmailMessage, sendEmail } from './email.ts';
import { inBackground, notifyParent, type NotifyParentInput } from './parentNotify.ts';
import { alertRecipient } from './refundAlerts.ts';
import { razorpayCall } from './razorpay.ts';
import { istParts } from './schedule.ts';
import { formatEmailDate } from './templates.ts';

/** ₹999 a month. Set on the Razorpay Plan; used here to check charges and for wording. */
export const CARE_PLAN_PRICE_PAISE = 99900;
export const CARE_PLAN_PRICE_LABEL = '₹999';
/** Consults included in each paid billing month (also the 0053 column default). */
export const CARE_PLAN_CREDITS = 3;
/**
 * Billing cycles the subscription may run (Razorpay needs a count). 120
 * months = 10 years; after that Razorpay marks it completed and the parent
 * can subscribe again.
 */
export const CARE_PLAN_TOTAL_COUNT = 120;
/** How long the first-payment page stays usable (Razorpay expire_by). */
export const AUTH_WINDOW_MINUTES = 120;
/** A not-yet-paid plan page is offered again while it has this long left. */
export const REUSE_MIN_MINUTES = 10;

export type PlanStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'cancelled'
  | 'completed'
  | 'expired';

export const LIVE_STATUSES: readonly PlanStatus[] = ['created', 'authenticated', 'active', 'pending', 'halted'];
export const FINAL_STATUSES: readonly PlanStatus[] = ['cancelled', 'completed', 'expired'];

export function isPlanStatus(v: unknown): v is PlanStatus {
  return typeof v === 'string' && (LIVE_STATUSES as readonly string[]).concat(FINAL_STATUSES).includes(v);
}

const RANK: Record<PlanStatus, number> = {
  created: 0,
  authenticated: 1,
  active: 2,
  pending: 2,
  halted: 2,
  cancelled: 3,
  completed: 3,
  expired: 3,
};

// ── Razorpay API ────────────────────────────────────────────────────────────

export interface RazorpaySubscription {
  id: string;
  plan_id?: string;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  ended_at?: number | null;
  paid_count?: number | null;
  short_url?: string | null;
  expire_by?: number | null;
  notes?: Record<string, string> | unknown[] | null;
}

export function carePlanRazorpayId(env: (k: string) => string | undefined = (k) => Deno.env.get(k)): string | null {
  const v = (env('RAZORPAY_CARE_PLAN_ID') ?? '').trim();
  return v || null;
}

export function createSubscription(input: {
  planId: string;
  carePlanId: string;
  parentId: string;
  expireBy: Date;
  email?: string | null;
  phone?: string | null;
}): Promise<RazorpaySubscription> {
  const notify: Record<string, string> = {};
  if (input.email) notify.notify_email = input.email;
  if (input.phone) notify.notify_phone = input.phone;
  return razorpayCall('POST', '/subscriptions', {
    plan_id: input.planId,
    total_count: CARE_PLAN_TOTAL_COUNT,
    quantity: 1,
    // Razorpay keeps sending its own payment / pre-debit notices (mandate
    // rules); our plan emails are on top.
    customer_notify: true,
    expire_by: Math.floor(input.expireBy.getTime() / 1000),
    ...(Object.keys(notify).length ? { notify_info: notify } : {}),
    notes: { care_plan_id: input.carePlanId, parent_id: input.parentId },
  });
}

export function fetchSubscription(id: string): Promise<RazorpaySubscription> {
  return razorpayCall('GET', `/subscriptions/${encodeURIComponent(id)}`);
}

/** atCycleEnd: stop renewing, keep the paid month. Otherwise ends now. */
export function cancelSubscription(id: string, atCycleEnd: boolean): Promise<RazorpaySubscription> {
  return razorpayCall('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, {
    cancel_at_cycle_end: atCycleEnd,
  });
}

/**
 * Cancel at Razorpay, tolerating a subscription that is already over there
 * (webhook missed) and, for an immediate cancel, one that was never
 * authorised ('created': it can't charge, and its page expires by itself
 * at expire_by). Anything else Razorpay refuses is thrown.
 */
export async function cancelAtRazorpay(id: string, atCycleEnd: boolean): Promise<void> {
  try {
    await cancelSubscription(id, atCycleEnd);
  } catch (e) {
    let sub: RazorpaySubscription;
    try {
      sub = await fetchSubscription(id);
    } catch {
      throw e;
    }
    if ((FINAL_STATUSES as readonly string[]).includes(sub.status)) return;
    if (!atCycleEnd && sub.status === 'created') {
      console.warn(`[care-plan] ${id}: cancel refused while 'created'; it expires unpaid by itself`);
      return;
    }
    throw e;
  }
}

// ── State machine ───────────────────────────────────────────────────────────

export interface PlanRow {
  id: string;
  parent_id: string | null;
  razorpay_subscription_id: string | null;
  status: PlanStatus;
  current_start: string | null;
  current_end: string | null;
  cancel_at_period_end: boolean;
  ended_at: string | null;
  paid_count: number;
  last_event_at: number | null;
  auth_expires_at?: string | null;
  short_url?: string | null;
}

export const PLAN_COLUMNS =
  'id, parent_id, razorpay_subscription_id, status, current_start, current_end, cancel_at_period_end, ' +
  'ended_at, paid_count, last_event_at, auth_expires_at, short_url';

export interface PlanEvent {
  status: PlanStatus;
  /** Event time, unix seconds (webhook created_at; "now" for a direct fetch). */
  at: number;
  current_start?: number | null;
  current_end?: number | null;
  ended_at?: number | null;
  paid_count?: number | null;
}

export interface PlanTransition {
  /** Columns to write; null = nothing to change (stale or same). */
  patch: Partial<PlanRow> | null;
  statusChanged: boolean;
  stale: boolean;
}

const iso = (unix: number | null | undefined): string | null | undefined =>
  unix === undefined ? undefined : unix === null ? null : new Date(unix * 1000).toISOString();

/**
 * What a Razorpay subscription state seen at `ev.at` does to our row.
 * Pure: the webhook and the direct fetch both go through it.
 */
export function nextPlanState(row: PlanRow, ev: PlanEvent): PlanTransition {
  const none = (stale: boolean): PlanTransition => ({ patch: null, statusChanged: false, stale });
  const rowFinal = FINAL_STATUSES.includes(row.status);
  const evFinal = FINAL_STATUSES.includes(ev.status);
  // A finished subscription stays finished.
  if (rowFinal) return none(ev.status !== row.status);
  // A final state is final whenever it arrives (nothing can follow it).
  if (!evFinal && row.last_event_at !== null) {
    if (ev.at < row.last_event_at) return none(true);
    if (ev.at === row.last_event_at && RANK[ev.status] < RANK[row.status]) return none(true);
  }

  const patch: Partial<PlanRow> = {
    status: ev.status,
    last_event_at: Math.max(ev.at, row.last_event_at ?? 0),
  };
  const start = iso(ev.current_start);
  const end = iso(ev.current_end);
  if (start) patch.current_start = start;
  if (end) patch.current_end = end;
  const ended = iso(ev.ended_at);
  if (ended) patch.ended_at = ended;
  if (typeof ev.paid_count === 'number') patch.paid_count = Math.max(ev.paid_count, row.paid_count ?? 0);

  const statusChanged = ev.status !== row.status;
  const sameDates =
    (patch.current_start ?? row.current_start) === row.current_start &&
    (patch.current_end ?? row.current_end) === row.current_end &&
    (patch.ended_at ?? row.ended_at) === row.ended_at &&
    (patch.paid_count ?? row.paid_count) === row.paid_count;
  if (!statusChanged && sameDates && patch.last_event_at === row.last_event_at) return none(false);
  return { patch, statusChanged, stale: false };
}

// ── Applying a Razorpay subscription to our rows ───────────────────────────

export type PlanEmail = Pick<NotifyParentInput, 'parentId' | 'template' | 'params' | 'payload'>;

export interface ApplyOptions {
  /** subscription.charged: the payment that paid for the current month. */
  charge?: { paymentId: string; amount: number | null } | null;
  /** Send a plan email (default: notifyParent in the background). */
  notify?: (email: PlanEmail) => void;
}

export interface ApplyResult {
  matched: boolean;
  planId?: string;
  status?: PlanStatus;
  statusChanged?: boolean;
  stale?: boolean;
  periodCreated?: boolean;
  emails: string[];
}

/** "Tuesday, 3 November" for an instant, in India time. */
export function planDate(at: string | Date): string {
  return formatEmailDate(istParts(new Date(at)).date);
}

function defaultNotify(admin: SupabaseClient) {
  return (email: PlanEmail) => inBackground(`plan email ${email.template}`, notifyParent(admin, email));
}

/** Our row for a subscription: by its id, else by the care_plan_id we put in its notes. */
export async function findPlanForSubscription(admin: SupabaseClient, sub: RazorpaySubscription): Promise<PlanRow | null> {
  const { data } = await admin.from('care_plans').select(PLAN_COLUMNS).eq('razorpay_subscription_id', sub.id).maybeSingle();
  if (data) return data as unknown as PlanRow;
  // The body is signed, so notes are ours (set in createSubscription). Used
  // if saving the subscription id failed.
  const noted = sub.notes && !Array.isArray(sub.notes) ? (sub.notes as Record<string, string>).care_plan_id : null;
  if (typeof noted === 'string' && /^[0-9a-f-]{36}$/i.test(noted)) {
    const { data: byNote } = await admin.from('care_plans').select(PLAN_COLUMNS).eq('id', noted).maybeSingle();
    const row = byNote as unknown as PlanRow | null;
    if (row && (row.razorpay_subscription_id === null || row.razorpay_subscription_id === sub.id)) {
      if (row.razorpay_subscription_id === null) {
        await admin.from('care_plans').update({ razorpay_subscription_id: sub.id }).eq('id', row.id).is('razorpay_subscription_id', null);
        row.razorpay_subscription_id = sub.id;
      }
      return row;
    }
  }
  return null;
}

/**
 * Record a paid month. Idempotent: one period per (plan, start); a second
 * report of the same month only fills in the payment id. Returns whether
 * this call created it, and whether it is the plan's first.
 */
export async function recordPaidPeriod(
  admin: SupabaseClient,
  planId: string,
  startUnix: number,
  endUnix: number,
  charge: { paymentId: string; amount: number | null } | null,
): Promise<{ created: boolean; first: boolean }> {
  const periodStart = new Date(startUnix * 1000).toISOString();
  const { error } = await admin.from('care_plan_periods').insert({
    care_plan_id: planId,
    period_start: periodStart,
    period_end: new Date(endUnix * 1000).toISOString(),
    credits_total: CARE_PLAN_CREDITS,
    razorpay_payment_id: charge?.paymentId ?? null,
    amount_paise: charge?.amount ?? null,
  });
  if (error) {
    if (error.code !== '23505') throw new Error(`care_plan_periods insert: ${error.message}`);
    if (charge?.paymentId) {
      await admin
        .from('care_plan_periods')
        .update({ razorpay_payment_id: charge.paymentId, amount_paise: charge.amount })
        .eq('care_plan_id', planId)
        .eq('period_start', periodStart)
        .is('razorpay_payment_id', null);
    }
    return { created: false, first: false };
  }
  const { count } = await admin
    .from('care_plan_periods')
    .select('id', { count: 'exact', head: true })
    .eq('care_plan_id', planId);
  return { created: true, first: (count ?? 1) <= 1 };
}

/**
 * Apply what Razorpay says about a subscription (webhook event or direct
 * fetch) to our rows, and send the emails that follow from it.
 */
export async function applySubscription(
  admin: SupabaseClient,
  sub: RazorpaySubscription,
  at: number,
  opts: ApplyOptions = {},
): Promise<ApplyResult> {
  const notify = opts.notify ?? defaultNotify(admin);
  const emails: string[] = [];
  if (!isPlanStatus(sub.status)) {
    console.warn(`[care-plan] ${sub.id}: status ${sub.status} not handled`);
    return { matched: false, emails };
  }
  let row = await findPlanForSubscription(admin, sub);
  if (!row) return { matched: false, emails };

  const ev: PlanEvent = {
    status: sub.status,
    at,
    current_start: sub.current_start,
    current_end: sub.current_end,
    ended_at: sub.ended_at,
    paid_count: sub.paid_count,
  };

  // Optimistic: write only if the row is still what we read; else read again.
  let t: PlanTransition = { patch: null, statusChanged: false, stale: false };
  const before = row.status;
  for (let attempt = 0; attempt < 3; attempt++) {
    t = nextPlanState(row, ev);
    if (!t.patch) break;
    let q = admin
      .from('care_plans')
      .update({ ...t.patch, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', row.status);
    q = row.last_event_at === null ? q.is('last_event_at', null) : q.eq('last_event_at', row.last_event_at);
    const { data: written } = await q.select('id').maybeSingle();
    if (written) {
      row = { ...row, ...t.patch } as PlanRow;
      break;
    }
    const { data: fresh } = await admin.from('care_plans').select(PLAN_COLUMNS).eq('id', row.id).maybeSingle();
    if (!fresh) break;
    row = fresh as unknown as PlanRow;
    t = { patch: null, statusChanged: false, stale: false };
  }

  // A paid month: from subscription.charged, or (webhook late) an active
  // subscription that has been charged, seen by a direct fetch.
  let periodCreated = false;
  // (A stale or after-the-end "active" is not a paid month; a charge is,
  // whenever it arrives.)
  const paidMonth =
    sub.current_start && sub.current_end &&
    (opts.charge || (sub.status === 'active' && (sub.paid_count ?? 0) > 0 && !t.stale && !FINAL_STATUSES.includes(row.status)));
  if (paidMonth) {
    if (opts.charge?.amount != null && opts.charge.amount !== CARE_PLAN_PRICE_PAISE) {
      console.error(`[care-plan] ${sub.id}: charged ${opts.charge.amount} paise, expected ${CARE_PLAN_PRICE_PAISE}`);
    }
    const p = await recordPaidPeriod(admin, row.id, sub.current_start!, sub.current_end!, opts.charge ?? null);
    periodCreated = p.created;
    if (p.created && row.parent_id) {
      const template = p.first ? 'care_plan_started' : 'care_plan_renewed';
      const key = p.first ? `started:${sub.id}` : `renewed:${sub.id}:${sub.current_start}`;
      notify({
        parentId: row.parent_id,
        template,
        params: { until: planDate(new Date(sub.current_end! * 1000)), price: CARE_PLAN_PRICE_LABEL },
        payload: { plan_key: key },
      });
      emails.push(key);
    }
  }

  if (t.statusChanged && row.parent_id) {
    const now = row.status;
    if (now === 'pending' || now === 'halted') {
      const key = `payment_failed:${sub.id}:${now}:${sub.current_end ?? ''}`;
      notify({
        parentId: row.parent_id,
        template: 'care_plan_payment_failed',
        params: { status: now, price: CARE_PLAN_PRICE_LABEL },
        payload: { plan_key: key },
      });
      emails.push(key);
    } else if ((now === 'cancelled' || now === 'completed') && before !== 'created') {
      // Same key as the parent's own cancel: one "cancelled" email per plan.
      const key = `cancelled:${sub.id}`;
      notify({
        parentId: row.parent_id,
        template: 'care_plan_cancelled',
        params: { ended: 'yes' },
        payload: { plan_key: key },
      });
      emails.push(key);
    }
  }

  return {
    matched: true,
    planId: row.id,
    status: row.status,
    statusChanged: t.statusChanged,
    stale: t.stale,
    periodCreated,
    emails,
  };
}

// ── Parent actions ──────────────────────────────────────────────────────────

/** The parent's live plan (not cancelled / completed / expired), if any. */
export async function livePlan(admin: SupabaseClient, parentId: string): Promise<PlanRow | null> {
  const { data } = await admin
    .from('care_plans')
    .select(PLAN_COLUMNS)
    .eq('parent_id', parentId)
    .in('status', [...LIVE_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as unknown as PlanRow | null) ?? null;
}

export type CancelPlanResult =
  | { state: 'none' }
  | { state: 'ends'; endsAt: string | null }
  | { state: 'cancelled' };

/**
 * Parent cancels. A plan with a paid month running stops renewing and stays
 * usable to the end of that month (Razorpay cancel_at_cycle_end). A plan
 * with nothing paid to run on (never paid, or a renewal that failed:
 * pending / halted) ends now. Throws RazorpayError if Razorpay refuses or
 * doesn't answer: nothing is changed here then.
 */
export async function cancelPlan(
  admin: SupabaseClient,
  row: PlanRow,
  opts: { notify?: (email: PlanEmail) => void; now?: number } = {},
): Promise<CancelPlanResult> {
  const notify = opts.notify ?? defaultNotify(admin);
  const nowIso = new Date(opts.now ?? Date.now()).toISOString();
  if (row.status === 'authenticated' || row.status === 'active') {
    if (!row.cancel_at_period_end && row.razorpay_subscription_id) {
      await cancelAtRazorpay(row.razorpay_subscription_id, true);
      await admin
        .from('care_plans')
        .update({ cancel_at_period_end: true, cancel_requested_at: nowIso, updated_at: nowIso })
        .eq('id', row.id);
      if (row.parent_id) {
        notify({
          parentId: row.parent_id,
          template: 'care_plan_cancelled',
          params: row.current_end ? { until: planDate(row.current_end) } : {},
          payload: { plan_key: `cancelled:${row.razorpay_subscription_id}` },
        });
      }
    }
    return { state: 'ends', endsAt: row.current_end };
  }
  const was = row.status;
  if (was === 'created' || was === 'pending' || was === 'halted') {
    if (row.razorpay_subscription_id) await cancelAtRazorpay(row.razorpay_subscription_id, false);
    await admin
      .from('care_plans')
      .update({ status: 'cancelled', ended_at: nowIso, cancel_requested_at: nowIso, updated_at: nowIso })
      .eq('id', row.id)
      .eq('status', was);
    if (row.parent_id && was !== 'created' && row.razorpay_subscription_id) {
      notify({
        parentId: row.parent_id,
        template: 'care_plan_cancelled',
        params: { ended: 'yes' },
        payload: { plan_key: `cancelled:${row.razorpay_subscription_id}` },
      });
    }
    return { state: 'cancelled' };
  }
  return { state: 'none' };
}

/**
 * Account deletion: end any live plan NOW so a deleted account is never
 * charged again. Throws if Razorpay can't confirm it (the deletion stops and
 * the parent is asked to try again).
 */
export async function endPlansForDeletedAccount(admin: SupabaseClient, parentId: string): Promise<number> {
  const { data } = await admin
    .from('care_plans')
    .select(PLAN_COLUMNS)
    .eq('parent_id', parentId)
    .in('status', [...LIVE_STATUSES]);
  let ended = 0;
  for (const row of (data ?? []) as unknown as PlanRow[]) {
    if (row.razorpay_subscription_id) await cancelAtRazorpay(row.razorpay_subscription_id, false);
    const nowIso = new Date().toISOString();
    await admin
      .from('care_plans')
      .update({ status: 'cancelled', ended_at: nowIso, cancel_requested_at: nowIso, updated_at: nowIso })
      .eq('id', row.id);
    ended++;
  }
  return ended;
}

// ── Plan consult cancelled: the credit rule ─────────────────────────────────

export type PlanCreditOutcome = 'returned' | 'rebook_owed' | 'used';

/**
 * Give a cancelled plan consult's credit back (service role RPC, 0053).
 * 'rebook_owed': the doctor cancelled after that billing month ended; the
 * team is told to book a free consult (refund page promise).
 */
export async function returnPlanCredit(admin: SupabaseClient, appointmentId: string): Promise<'returned' | 'rebook_owed' | 'none'> {
  const { data, error } = await admin.rpc('return_plan_credit', { p_appointment_id: appointmentId });
  if (error) throw new Error(`return_plan_credit: ${error.message}`);
  return (data as 'returned' | 'rebook_owed' | 'none') ?? 'none';
}

/**
 * Email the team that a family is owed a free consult (doctor cancelled a
 * plan consult after its month ended). Booking facts only: no names, no
 * health information. Best effort; also logged as an error.
 */
export async function alertRebookOwed(
  appointmentId: string,
  consult: { date: string; time: string },
  send: (msg: EmailMessage) => Promise<unknown> = (m) => sendEmail(m),
): Promise<void> {
  console.error(`[care-plan] FREE REBOOK OWED for appointment ${appointmentId} (doctor cancelled after the plan month ended)`);
  const lines = [
    'A doctor cancelled a Care Plan consult after that billing month had ended, so the consult could not go back to the plan.',
    'Our refund policy promises a free consult instead: please book one for the family (contact them from the dashboard chat).',
    '',
    `Appointment id: ${appointmentId}`,
    `Cancelled consult time (IST): ${consult.date} ${String(consult.time).slice(0, 5)}`,
    '',
    `When done: update public.care_plan_credit_uses set status = 'returned' where appointment_id = '${appointmentId}';`,
  ];
  try {
    await send({
      to: alertRecipient(),
      subject: '[LilSteps] Care Plan: a free consult is owed',
      text: lines.join('\n'),
      html: `<!doctype html><html><body style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#0b1632;font-size:14px;line-height:20px;">${lines
        .map((l) => (l ? `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : ''))
        .join('')}</body></html>`,
    });
  } catch (e) {
    console.error(`[care-plan] rebook alert ${appointmentId}: ${(e as Error).message}`);
  }
}
