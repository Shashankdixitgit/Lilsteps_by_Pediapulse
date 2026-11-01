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
// A subscription we already consider over (cancelled / expired here) that
// Razorpay later reports as authenticated / active / charged — e.g. an
// unpaid page paid late from Razorpay's own email — is never billed
// silently: the team is alerted; if the parent has no other live plan the
// row is reopened with Razorpay's status, otherwise it is cancelled at
// Razorpay at once and the team refunds the charge (see applySubscription).
//
// Without subscription webhooks (they are not enabled on the Razorpay
// webhook), the same path is driven by syncCarePlans: a 15-minute sweep in
// appointment-reminders that fetches each live subscription (and each one
// ended here in the last few days, so a late payment is still caught) and
// applies it — see "Sync" below. use_plan syncs the caller's own plan first.
//
// Team alerts (ALERT_EMAIL): free consult owed, a subscription we couldn't
// cancel, a revived subscription, a charge of the wrong amount.
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
import { razorpayCall, RazorpayError } from './razorpay.ts';
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
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'expired';

/** paused (merchant-paused at Razorpay) is handled like halted: live, no new credits. */
export const LIVE_STATUSES: readonly PlanStatus[] = ['created', 'authenticated', 'active', 'pending', 'halted', 'paused'];
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
  paused: 2,
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

export interface RazorpayPlan {
  id: string;
  period?: string;
  interval?: number;
  item?: { amount?: number; currency?: string } | null;
}

const verifiedPlans = new Set<string>();

/**
 * Whether the Razorpay Plan behind RAZORPAY_CARE_PLAN_ID really is ₹999,
 * INR, monthly (interval 1). A good answer is cached per plan id for the
 * life of the function instance; a wrong one is logged loudly and not
 * cached (fixing the plan or the secret takes effect at once).
 */
export async function verifyCarePlanPlan(planId: string): Promise<boolean> {
  if (verifiedPlans.has(planId)) return true;
  const plan = (await razorpayCall('GET', `/plans/${encodeURIComponent(planId)}`)) as RazorpayPlan;
  const ok =
    plan?.item?.amount === CARE_PLAN_PRICE_PAISE &&
    plan.item?.currency === 'INR' &&
    plan.period === 'monthly' &&
    Number(plan.interval) === 1;
  if (!ok) {
    console.error(
      `[care-plan] RAZORPAY_CARE_PLAN_ID ${planId} is not ₹999 / monthly / INR ` +
        `(amount ${plan?.item?.amount}, currency ${plan?.item?.currency}, period ${plan?.period}, interval ${plan?.interval}). ` +
        'Subscribe is refused until the secret points at the right plan.',
    );
    return false;
  }
  verifiedPlans.add(planId);
  return true;
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

export function fetchSubscription(id: string, opts: { timeoutMs?: number } = {}): Promise<RazorpaySubscription> {
  return razorpayCall('GET', `/subscriptions/${encodeURIComponent(id)}`, undefined, opts);
}

/** atCycleEnd: stop renewing, keep the paid month. Otherwise ends now. */
export function cancelSubscription(id: string, atCycleEnd: boolean): Promise<RazorpaySubscription> {
  return razorpayCall('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, {
    cancel_at_cycle_end: atCycleEnd,
  });
}

/** Razorpay says this subscription doesn't exist (e.g. a test-mode id after switching to live keys). */
export function isMissingAtRazorpay(e: unknown): boolean {
  return e instanceof RazorpayError &&
    (e.status === 404 || /does not exist|not found|no such|invalid .*id/i.test(e.detail));
}

export type RazorpayCancelOutcome = 'cancelled' | 'already_over' | 'left_unpaid';

/**
 * Cancel at Razorpay, tolerating a subscription that is already over there
 * (webhook missed), one Razorpay doesn't know (404 / "does not exist"), and,
 * for an immediate cancel, one never authorised ('created': it can't charge;
 * its page expires by itself at expire_by — and if it is paid anyway,
 * applySubscription catches it). Anything else Razorpay refuses is thrown.
 */
export async function cancelAtRazorpay(id: string, atCycleEnd: boolean): Promise<RazorpayCancelOutcome> {
  try {
    await cancelSubscription(id, atCycleEnd);
    return 'cancelled';
  } catch (e) {
    if (isMissingAtRazorpay(e)) return 'already_over';
    let sub: RazorpaySubscription;
    try {
      sub = await fetchSubscription(id);
    } catch (f) {
      if (isMissingAtRazorpay(f)) return 'already_over';
      throw e;
    }
    if ((FINAL_STATUSES as readonly string[]).includes(sub.status)) return 'already_over';
    if (!atCycleEnd && sub.status === 'created') {
      console.warn(`[care-plan] ${id}: cancel refused while 'created'; it expires unpaid by itself`);
      return 'left_unpaid';
    }
    throw e;
  }
}

// ── Team alerts ─────────────────────────────────────────────────────────────

export type TeamAlert = (subject: string, lines: string[]) => Promise<void>;

/**
 * Email the LilSteps team (ALERT_EMAIL). Ids and facts only: no names,
 * contact details or anything about health. Best effort; always logged.
 */
export async function alertTeam(
  subject: string,
  lines: string[],
  send: (msg: EmailMessage) => Promise<unknown> = (m) => sendEmail(m),
): Promise<void> {
  console.error(`[care-plan] TEAM ALERT: ${subject} — ${lines.filter(Boolean).join(' | ')}`);
  try {
    await send({
      to: alertRecipient(),
      subject: `[LilSteps] ${subject}`,
      text: lines.join('\n'),
      html: `<!doctype html><html><body style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#0b1632;font-size:14px;line-height:20px;">${lines
        .map((l) => (l ? `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : ''))
        .join('')}</body></html>`,
    });
  } catch (e) {
    console.error(`[care-plan] team alert "${subject}": ${(e as Error).message}`);
  }
}

const defaultAlert: TeamAlert = (subject, lines) => {
  inBackground('care plan alert', alertTeam(subject, lines));
  return Promise.resolve();
};

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

const nowUnix = () => Math.floor(Date.now() / 1000);

/**
 * What a Razorpay subscription state seen at `ev.at` does to our row.
 * Pure: the webhook and the direct fetch both go through it. (A final row
 * that Razorpay reports alive again is handled before this, in
 * applySubscription.)
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

/**
 * What `subscribe` answers for the parent's live plan (null: make a new
 * one). 'starting': Razorpay has the mandate but no paid month yet — never
 * reported as active.
 */
export function subscribeAnswer(row: PlanRow | null): 'active' | 'pending' | 'starting' | 'replace' | 'reuse' | null {
  if (!row) return null;
  if (row.status === 'active') return 'active';
  if (row.status === 'authenticated') return 'starting';
  if (row.status === 'pending') return 'pending';
  if (row.status === 'halted' || row.status === 'paused') return 'replace';
  if (row.status === 'created') return 'reuse';
  return null;
}

// ── Applying a Razorpay subscription to our rows ───────────────────────────

export type PlanEmail = Pick<NotifyParentInput, 'parentId' | 'template' | 'params' | 'payload'>;

export interface ApplyOptions {
  /** subscription.charged: the payment that paid for the current month. */
  charge?: { paymentId: string; amount: number | null } | null;
  /** Send a plan email (default: notifyParent in the background). */
  notify?: (email: PlanEmail) => void;
  /** Email the team (default: alertTeam in the background). */
  alert?: TeamAlert;
}

export interface ApplyResult {
  matched: boolean;
  planId?: string;
  status?: PlanStatus;
  statusChanged?: boolean;
  stale?: boolean;
  periodCreated?: boolean;
  /** A subscription we had ended came back to life: what was done. */
  revived?: 'reopened' | 'cancelled';
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

async function periodCount(admin: SupabaseClient, planId: string): Promise<number> {
  const { count } = await admin
    .from('care_plan_periods')
    .select('id', { count: 'exact', head: true })
    .eq('care_plan_id', planId);
  return count ?? 0;
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
  return { created: true, first: (await periodCount(admin, planId)) <= 1 };
}

const ALIVE_AT_RAZORPAY = ['authenticated', 'active'];

/**
 * Our row is final (cancelled / expired here) but Razorpay, in a NEWER
 * event, says the subscription is authenticated / active / charged: money
 * may be taken for a plan nobody sees. The team is always told. If the
 * parent has no other live plan, the row is reopened with Razorpay's status
 * (they paid for it: they get it); otherwise the subscription is cancelled
 * at Razorpay at once and the team refunds the charge.
 */
async function handleRevived(
  admin: SupabaseClient,
  row: PlanRow,
  sub: RazorpaySubscription,
  at: number,
  opts: ApplyOptions,
  alert: TeamAlert,
): Promise<{ row: PlanRow; revived: 'reopened' | 'cancelled' }> {
  const facts = [
    `Razorpay subscription: ${sub.id} (status there: ${sub.status})`,
    `Our care_plans row: ${row.id} (was ${row.status})`,
    opts.charge ? `Charge: ${opts.charge.paymentId}, ${opts.charge.amount ?? '?'} paise` : 'Charge: none in this event',
  ];

  let other: PlanRow | null = null;
  if (row.parent_id) other = await livePlan(admin, row.parent_id);
  if (row.parent_id && !other) {
    const { data: reopened, error } = await admin
      .from('care_plans')
      .update({
        status: sub.status,
        last_event_at: at,
        current_start: iso(sub.current_start) ?? row.current_start,
        current_end: iso(sub.current_end) ?? row.current_end,
        paid_count: Math.max(sub.paid_count ?? 0, row.paid_count ?? 0),
        ended_at: null,
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('status', row.status)
      .select(PLAN_COLUMNS)
      .maybeSingle();
    if (reopened && !error) {
      await alert('Care Plan: an ended subscription was paid, plan reopened', [
        'A Care Plan subscription we had ended was authorised or charged at Razorpay afterwards (for example the parent paid an old link from Razorpay\'s email).',
        'The family had no other plan, so the plan has been reopened: they get what they paid for, and it will renew monthly until cancelled.',
        'Check with the family if this is what they wanted.',
        '',
        ...facts,
      ]);
      return { row: reopened as unknown as PlanRow, revived: 'reopened' };
    }
  }

  let cancelNote: string;
  try {
    const r = await cancelAtRazorpay(sub.id, false);
    cancelNote = `Cancelled at Razorpay now (${r}).`;
  } catch (e) {
    cancelNote = `Cancelling it at Razorpay FAILED (${(e as Error).message}): cancel it by hand in the Razorpay dashboard.`;
  }
  await alert('Care Plan: duplicate subscription charged, refund needed', [
    'A Care Plan subscription we had ended was authorised or charged at Razorpay afterwards, while the family ' +
      (row.parent_id ? `already has another live plan (${other?.id}).` : 'no longer has an account.'),
    cancelNote,
    opts.charge
      ? `Refund this charge in full in the Razorpay dashboard: payment ${opts.charge.paymentId}.`
      : 'If Razorpay took any payment on it, refund it in full in the Razorpay dashboard.',
    '',
    ...facts,
  ]);
  return { row, revived: 'cancelled' };
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
  const alert = opts.alert ?? defaultAlert;
  const emails: string[] = [];
  if (!isPlanStatus(sub.status)) {
    console.warn(`[care-plan] ${sub.id}: status ${sub.status} not handled`);
    return { matched: false, emails };
  }
  let row = await findPlanForSubscription(admin, sub);
  if (!row) return { matched: false, emails };

  // Ended here, alive again at Razorpay (newer than what ended it).
  let revived: ApplyResult['revived'];
  if (
    FINAL_STATUSES.includes(row.status) &&
    (ALIVE_AT_RAZORPAY.includes(sub.status) || opts.charge) &&
    (row.last_event_at === null || at > row.last_event_at)
  ) {
    const r = await handleRevived(admin, row, sub, at, opts, alert);
    revived = r.revived;
    row = r.row;
    if (revived === 'cancelled') {
      return { matched: true, planId: row.id, status: row.status, revived, emails };
    }
  }

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

  // A paid month: from subscription.charged (whenever it arrives), or —
  // webhook late — an active subscription seen by a direct fetch, but only
  // when Razorpay counts more paid months than we have recorded.
  let periodCreated = false;
  let paidMonth = false;
  if (sub.current_start && sub.current_end) {
    if (opts.charge) {
      if (opts.charge.amount != null && opts.charge.amount !== CARE_PLAN_PRICE_PAISE) {
        await alert('Care Plan: charge of the wrong amount, no consults given', [
          `Razorpay charged ${opts.charge.amount} paise on a Care Plan subscription; the plan is ${CARE_PLAN_PRICE_PAISE} paise.`,
          'No plan consults were added for this month. Check the Razorpay plan (RAZORPAY_CARE_PLAN_ID) and refund or correct the charge by hand.',
          '',
          `Razorpay subscription: ${sub.id}`,
          `Payment: ${opts.charge.paymentId}`,
          `Our care_plans row: ${row.id}`,
        ]);
      } else {
        paidMonth = true;
      }
    } else if (
      sub.status === 'active' && !t.stale && !FINAL_STATUSES.includes(row.status) &&
      (sub.paid_count ?? 0) > (await periodCount(admin, row.id))
    ) {
      paidMonth = true;
    }
  }
  if (paidMonth) {
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
    revived,
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

/** Mark a plan ended here (we ended it), stamped now so only newer Razorpay news can revive it. */
export async function markEndedLocally(
  admin: SupabaseClient,
  row: PlanRow,
  status: 'cancelled' | 'expired' = 'cancelled',
): Promise<void> {
  const nowIso = new Date().toISOString();
  await admin
    .from('care_plans')
    .update({ status, ended_at: nowIso, cancel_requested_at: nowIso, updated_at: nowIso, last_event_at: nowUnix() })
    .eq('id', row.id)
    .eq('status', row.status);
}

export type CancelPlanResult =
  | { state: 'none' }
  | { state: 'ends'; endsAt: string | null }
  | { state: 'cancelled' };

/**
 * Parent cancels. A plan with a paid month running stops renewing and stays
 * usable to the end of that month (Razorpay cancel_at_cycle_end). A plan
 * with nothing paid to run on (never paid, authorised without a paid month
 * yet, or a renewal that failed: pending / halted / paused) ends now.
 * Throws RazorpayError if Razorpay refuses or doesn't answer: nothing is
 * changed here then.
 */
export async function cancelPlan(
  admin: SupabaseClient,
  row: PlanRow,
  opts: { notify?: (email: PlanEmail) => void; now?: number } = {},
): Promise<CancelPlanResult> {
  const notify = opts.notify ?? defaultNotify(admin);
  const nowIso = new Date(opts.now ?? Date.now()).toISOString();
  const hasPaidMonth =
    (row.status === 'authenticated' || row.status === 'active') &&
    ((row.paid_count ?? 0) > 0 || (await periodCount(admin, row.id)) > 0);
  if (hasPaidMonth) {
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
  if ((LIVE_STATUSES as readonly string[]).includes(row.status)) {
    if (row.razorpay_subscription_id) await cancelAtRazorpay(row.razorpay_subscription_id, false);
    await markEndedLocally(admin, row);
    // An email only for a plan that ran (a failed renewal); not for one never paid.
    if (row.parent_id && row.razorpay_subscription_id && (row.paid_count ?? 0) > 0) {
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

export interface EndPlansSummary {
  /** Live plans handled (ended now, or already ending at the month's end). */
  ended: number;
  /** Razorpay could not confirm: the team was emailed to cancel by hand. */
  alerted: number;
}

/**
 * Account deletion: stop every live plan from charging again. Never stops
 * the deletion:
 *   • already set to end at the month's end (cancel_at_period_end): no
 *     Razorpay call (it refuses a second cancel); it simply runs out;
 *   • Razorpay says it's over or doesn't know it (404 / "does not exist",
 *     e.g. a test-mode id under live keys): ended;
 *   • any other Razorpay failure: the team is emailed to cancel it by hand,
 *     and the deletion goes on.
 */
export async function endPlansForDeletedAccount(
  admin: SupabaseClient,
  parentId: string,
  opts: { alert?: TeamAlert } = {},
): Promise<EndPlansSummary> {
  const alert = opts.alert ?? alertTeam;
  const { data } = await admin
    .from('care_plans')
    .select(PLAN_COLUMNS)
    .eq('parent_id', parentId)
    .in('status', [...LIVE_STATUSES]);
  const summary: EndPlansSummary = { ended: 0, alerted: 0 };
  for (const row of (data ?? []) as unknown as PlanRow[]) {
    if (row.cancel_at_period_end) {
      summary.ended++;
      continue;
    }
    if (row.razorpay_subscription_id) {
      try {
        await cancelAtRazorpay(row.razorpay_subscription_id, false);
      } catch (e) {
        summary.alerted++;
        await alert('Care Plan: cancel a deleted account\'s subscription by hand', [
          'A parent deleted their account, but Razorpay did not confirm cancelling their Care Plan subscription. The account was deleted anyway.',
          'Please cancel this subscription in the Razorpay dashboard (Subscriptions) so it is not charged again, and refund any charge made after the deletion.',
          '',
          `Razorpay subscription: ${row.razorpay_subscription_id}`,
          `Our care_plans row: ${row.id} (status ${row.status})`,
          `Razorpay answer: ${(e as Error).message}`,
        ]);
        continue;
      }
    }
    await markEndedLocally(admin, row);
    summary.ended++;
  }
  return summary;
}

// ── Sync (no subscription webhooks) ────────────────────────────────────────

/** Plans asked about per sweep run. */
export const SYNC_BATCH = 50;
/** A sweep run stops starting new fetches after this long (Razorpay timeouts are 15 s each). */
export const SYNC_BUDGET_MS = 45_000;
/**
 * Plans ended HERE are still checked for this long: a subscription we
 * dropped while its first-payment page was open ('created' can't be
 * cancelled at Razorpay) can still be paid until that page expires (2 h).
 * Without the webhook only the sweep can see that and run the revived
 * logic (applySubscription → handleRevived).
 */
export const SYNC_ENDED_WINDOW_MS = 3 * 86_400_000;

export interface SyncOptions extends Pick<ApplyOptions, 'notify' | 'alert'> {
  /** Shorter Razorpay timeout (use_plan: a parent is waiting). */
  timeoutMs?: number;
}

/**
 * Ask Razorpay about one plan and apply the answer through
 * applySubscription (the webhook's path): status and dates, a paid month
 * when Razorpay counts more paid months than we have recorded (once: one
 * period per plan and start), the failed / cancelled emails (one per
 * plan_key), and the revived-subscription alert / reopen. last_synced_at is
 * stamped first, even if Razorpay then fails. Throws what Razorpay throws.
 */
export async function syncPlan(
  admin: SupabaseClient,
  row: Pick<PlanRow, 'id' | 'razorpay_subscription_id'>,
  opts: SyncOptions = {},
): Promise<ApplyResult | null> {
  if (!row.razorpay_subscription_id) return null;
  await admin.from('care_plans').update({ last_synced_at: new Date().toISOString() }).eq('id', row.id);
  const sub = await fetchSubscription(row.razorpay_subscription_id, { timeoutMs: opts.timeoutMs });
  // A direct fetch is "now" (the status check does the same).
  return await applySubscription(admin, sub, nowUnix(), { notify: opts.notify, alert: opts.alert });
}

export interface SyncSummary {
  checked: number;
  /** Status changed, a month recorded, or a revived subscription handled. */
  changed: number;
  periodsRecorded: number;
  errors: Array<{ planId: string; error: string }>;
  /** Not reached this run (time budget); they are first next run. */
  deferred: number;
  skipped?: 'razorpay_not_configured';
}

/**
 * The 15-minute sweep: every live plan (created / authenticated / active /
 * pending / halted / paused — a plan set to end at the month's end is still
 * 'active' until Razorpay ends it, so it is included) and every plan ended
 * in the last SYNC_ENDED_WINDOW_MS, with a Razorpay subscription id; at
 * most `limit`, longest-unchecked first. One plan failing (Razorpay error,
 * unknown id) never stops the others. Never throws for a single plan.
 */
export async function syncCarePlans(
  admin: SupabaseClient,
  opts: SyncOptions & { limit?: number; budgetMs?: number; now?: () => number } = {},
): Promise<SyncSummary> {
  const summary: SyncSummary = { checked: 0, changed: 0, periodsRecorded: 0, errors: [], deferred: 0 };
  if (!Deno.env.get('RAZORPAY_KEY_ID') || !Deno.env.get('RAZORPAY_KEY_SECRET')) {
    summary.skipped = 'razorpay_not_configured';
    return summary;
  }
  const now = opts.now ?? Date.now;
  const started = now();
  const endedSince = new Date(started - SYNC_ENDED_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from('care_plans')
    .select('id, razorpay_subscription_id, status, last_synced_at')
    .not('razorpay_subscription_id', 'is', null)
    .or(`status.in.(${LIVE_STATUSES.join(',')}),ended_at.gte.${endedSince}`)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(opts.limit ?? SYNC_BATCH);
  if (error) throw new Error(`care plan sync: ${error.message}`);
  const rows = (data ?? []) as Array<Pick<PlanRow, 'id' | 'razorpay_subscription_id' | 'status'>>;

  for (let i = 0; i < rows.length; i++) {
    if (now() - started > (opts.budgetMs ?? SYNC_BUDGET_MS)) {
      summary.deferred = rows.length - i;
      break;
    }
    const row = rows[i];
    summary.checked++;
    try {
      const r = await syncPlan(admin, row, opts);
      if (r?.statusChanged || r?.periodCreated || r?.revived) summary.changed++;
      if (r?.periodCreated) summary.periodsRecorded++;
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[care-plan] sync ${row.id} (${row.razorpay_subscription_id}): ${msg}`);
      summary.errors.push({ planId: row.id, error: msg });
    }
  }
  return summary;
}

// ── Plan consult cancelled: the credit rule ─────────────────────────────────

/**
 * returned     back to its month (still running)
 * rebook_owed  the DOCTOR cancelled after that month ended: the team books a free consult
 * expired      the parent cancelled after that month ended: the month is over, nothing to give back
 * used         cancelled under 2 h before (parent): it counts
 */
export type PlanCreditOutcome = 'returned' | 'rebook_owed' | 'expired' | 'used';

/** Give a cancelled plan consult's credit back by the rule (service role RPC, 0053). */
export async function returnPlanCredit(
  admin: SupabaseClient,
  appointmentId: string,
  by: 'parent' | 'doctor',
): Promise<'returned' | 'rebook_owed' | 'expired' | 'none'> {
  const { data, error } = await admin.rpc('return_plan_credit', { p_appointment_id: appointmentId, p_by: by });
  if (error) throw new Error(`return_plan_credit: ${error.message}`);
  return (data as 'returned' | 'rebook_owed' | 'expired' | 'none') ?? 'none';
}

/**
 * Email the team that a family is owed a free consult (doctor cancelled a
 * plan consult after its month ended). Booking facts only.
 */
export function alertRebookOwed(
  appointmentId: string,
  consult: { date: string; time: string },
  send?: (msg: EmailMessage) => Promise<unknown>,
): Promise<void> {
  return alertTeam(
    'Care Plan: a free consult is owed',
    [
      'A doctor cancelled a Care Plan consult after that billing month had ended, so the consult could not go back to the plan.',
      'Our refund policy promises a free consult instead: please book one for the family (contact them from the dashboard chat).',
      '',
      `Appointment id: ${appointmentId}`,
      `Cancelled consult time (IST): ${consult.date} ${String(consult.time).slice(0, 5)}`,
      '',
      `When done: update public.care_plan_credit_uses set status = 'returned' where appointment_id = '${appointmentId}';`,
    ],
    send,
  );
}
