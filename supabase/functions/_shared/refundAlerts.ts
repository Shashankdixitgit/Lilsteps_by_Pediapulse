// Refund-failure alerts to the LilSteps team (item 13).
//
// When a refund can't be done by the system, a person has to do it in the
// Razorpay dashboard. This emails the team (ALERT_EMAIL, default
// dev@lilstepsclinics.com) ONCE per payment, when:
//   • refundPaymentRow() gets a refusal / no answer from Razorpay
//     (status → refund_failed),
//   • Razorpay's webhook says refund.failed,
//   • the sweep (run by appointment-reminders every 15 minutes) finds a
//     payment that is refund_failed, refund_due for more than 30 minutes, or
//     refund_pending for more than 30 minutes with no Razorpay refund id
//     (the refund call was claimed but never answered).
//
// "Once" is enforced by notification_log (template 'refund_alert',
// payload.payment_id): a sent or in-flight alert stops another, and the
// 0052 unique index stops two senders racing. A failed send is retried by
// the sweep up to MAX_ATTEMPTS times.
//
// The email holds payment facts only: row id, amount, status, reason,
// Razorpay ids and the consult time. Never a child's or parent's name, an
// address, or anything about health.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { type EmailMessage, type EmailResult, sendEmail } from './email.ts';
import { MAX_ATTEMPTS, STALE_QUEUED_MS } from './parentNotify.ts';

export const ALERT_TEMPLATE = 'refund_alert';
export const DEFAULT_ALERT_EMAIL = 'dev@lilstepsclinics.com';
/** A refund still owed (refund_due) or claimed but unanswered after this long is "stuck". */
export const STUCK_REFUND_MS = 30 * 60_000;

export type AlertKind = 'refund_failed' | 'refund_stuck';
export type AlertOutcome = 'sent' | 'already' | 'gave_up' | 'resolved' | 'not_found' | 'failed';

export interface AlertPayment {
  id: string;
  status: string;
  amount_paise: number;
  currency: string | null;
  razorpay_payment_id: string | null;
  razorpay_link_id: string | null;
  refund_id: string | null;
  refund_reason: string | null;
  appointment_id: string | null;
  parent_id: string | null;
  paid_at: string | null;
  updated_at: string | null;
}

const PAYMENT_COLUMNS =
  'id, status, amount_paise, currency, razorpay_payment_id, razorpay_link_id, refund_id, refund_reason, ' +
  'appointment_id, parent_id, paid_at, updated_at';

/** Statuses where money may still be owed back: worth a person's look. */
const OWED = ['refund_failed', 'refund_due', 'refund_pending'];

export function alertRecipient(env: (k: string) => string | undefined = (k) => Deno.env.get(k)): string {
  return (env('ALERT_EMAIL') ?? '').trim() || DEFAULT_ALERT_EMAIL;
}

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

/** Ids and reasons are ours or Razorpay's, but keep them one short line each. */
function clean(v: unknown): string {
  return String(v ?? '')
    // deno-lint-ignore no-control-regex
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, 120);
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The alert email. Payment facts only — no names, contact details or health information. */
export function renderRefundAlert(
  p: AlertPayment,
  consult: { date: string; time: string } | null,
  kind: AlertKind,
  note?: string,
): Omit<EmailMessage, 'to'> {
  const what =
    kind === 'refund_failed'
      ? 'A refund failed: Razorpay refused it or did not answer.'
      : 'A refund is stuck: money is owed back but no refund has gone through for over 30 minutes.';
  const rows: Array<[string, string]> = [
    ['Payment row id', p.id],
    ['Amount', `${formatRupees(p.amount_paise)} (${p.amount_paise} paise${p.currency && p.currency !== 'INR' ? ` ${p.currency}` : ''})`],
    ['Status now', p.status],
    ['Refund reason', p.refund_reason ?? '—'],
    ['Razorpay payment id', p.razorpay_payment_id ?? '—'],
    ['Razorpay payment link id', p.razorpay_link_id ?? '—'],
    ['Razorpay refund id', p.refund_id ?? '— (none yet)'],
    ['Consult time (IST)', consult ? `${consult.date} ${String(consult.time).slice(0, 5)}` : 'booking no longer exists'],
    ['Paid at', p.paid_at ?? '—'],
    ['Last updated', p.updated_at ?? '—'],
    ['Parent account', p.parent_id ? 'active' : 'deleted (nobody will retry this from the app)'],
    ...(note ? [['Detail', note] as [string, string]] : []),
  ].map(([k, v]) => [k, clean(v)]);

  const steps = [
    'Open the payment in the Razorpay dashboard (Transactions → Payments, search the Razorpay payment id).',
    'Check its Refunds first: the app retries refund_failed payments when the family opens the booking, so a refund may already exist. Never refund twice.',
    'If there is no refund, refund the full amount there.',
    `Then record it: update public.payments set status = 'refunded', refund_id = '<rfnd_…>', refunded_at = now(), updated_at = now() where id = '${clean(p.id)}';`,
  ];

  const subject = `[LilSteps] Refund needs attention: payment ${clean(p.id).slice(0, 8)}`;
  const text = [
    what,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'What to do:',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    'You get this email once per payment.',
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#0b1632;font-size:14px;line-height:20px;">
<p><strong>${escapeHtml(what)}</strong></p>
<table cellpadding="4" cellspacing="0" style="border-collapse:collapse;">
${rows.map(([k, v]) => `<tr><td style="color:#65687b;padding-right:12px;">${escapeHtml(k)}</td><td style="font-family:Menlo,Consolas,monospace;">${escapeHtml(v)}</td></tr>`).join('\n')}
</table>
<p><strong>What to do</strong></p>
<ol>${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
<p style="color:#65687b;">You get this email once per payment.</p>
</body></html>`;
  return { subject, text, html };
}

export interface AlertOptions {
  note?: string;
  /** Injected in tests; defaults to SMTP (email.ts). */
  send?: (msg: EmailMessage) => Promise<EmailResult>;
  to?: string;
}

interface LogRow {
  status: string;
  created_at: string;
  payload?: { payment_id?: string } | null;
}

/** Already alerted (sent, or being sent right now), or tried MAX_ATTEMPTS times. */
export function alertSettled(rows: LogRow[], now = Date.now()): 'already' | 'gave_up' | null {
  const freshQueued = now - STALE_QUEUED_MS;
  if (rows.some((r) => r.status === 'sent' || (r.status === 'queued' && new Date(r.created_at).getTime() >= freshQueued))) {
    return 'already';
  }
  return rows.length >= MAX_ATTEMPTS ? 'gave_up' : null;
}

/**
 * Email the team about one payment whose refund needs a person. Idempotent:
 * call it as often as you like, it emails once. Never throws.
 */
export async function alertRefundProblem(
  admin: SupabaseClient,
  paymentRowId: string,
  kind: AlertKind,
  opts: AlertOptions = {},
): Promise<AlertOutcome> {
  try {
    const { data: p, error } = await admin.from('payments').select(PAYMENT_COLUMNS).eq('id', paymentRowId).maybeSingle();
    if (error) throw new Error(`payments: ${error.message}`);
    if (!p) return 'not_found';
    const payment = p as unknown as AlertPayment;
    // Refunded (or never paid) since: nothing for a person to do.
    if (!OWED.includes(payment.status)) return 'resolved';

    // A queued alert whose sender died stops counting as in flight.
    await admin
      .from('notification_log')
      .update({ status: 'failed', error: 'no result within 10 minutes' })
      .eq('template', ALERT_TEMPLATE)
      .eq('payload->>payment_id', paymentRowId)
      .eq('status', 'queued')
      .lt('created_at', new Date(Date.now() - STALE_QUEUED_MS).toISOString());

    const { data: tries } = await admin
      .from('notification_log')
      .select('status, created_at')
      .eq('template', ALERT_TEMPLATE)
      .eq('payload->>payment_id', paymentRowId);
    const settled = alertSettled((tries ?? []) as LogRow[]);
    if (settled) return settled;

    let consult: { date: string; time: string } | null = null;
    if (payment.appointment_id) {
      const { data: appt } = await admin
        .from('appointments')
        .select('date, time')
        .eq('id', payment.appointment_id)
        .maybeSingle();
      if (appt) consult = { date: String((appt as any).date), time: String((appt as any).time) };
    }

    const to = opts.to ?? alertRecipient();
    const { data: queued, error: queueErr } = await admin
      .from('notification_log')
      .insert({
        channel: 'email',
        template: ALERT_TEMPLATE,
        recipient: to,
        status: 'queued',
        // Ids only: this row outlives the parent's account on purpose.
        payload: { template: ALERT_TEMPLATE, payment_id: paymentRowId, kind },
      })
      .select('id')
      .single();
    // 23505: another caller is sending (or has sent) this alert (0052 index).
    if (queueErr?.code === '23505') return 'already';
    if (queueErr) throw new Error(`notification_log insert: ${queueErr.message}`);

    const msg = { to, ...renderRefundAlert(payment, consult, kind, opts.note) };
    const r = await (opts.send ?? ((m: EmailMessage) => sendEmail(m)))(msg);
    const status = r.ok ? 'sent' : r.notConfigured ? 'skipped' : 'failed';
    await admin
      .from('notification_log')
      .update({ status, error: r.error ?? null, sent_at: r.ok ? new Date().toISOString() : null })
      .eq('id', (queued as any).id);
    if (!r.ok) {
      console.error(`[refund-alert] could not email the alert for payment ${paymentRowId}: ${r.error}`);
      return 'failed';
    }
    console.log(`[refund-alert] alerted ${to} about payment ${paymentRowId} (${kind})`);
    return 'sent';
  } catch (e) {
    console.error(`[refund-alert] payment ${paymentRowId}: ${(e as Error).message}`);
    return 'failed';
  }
}

/**
 * Find payments a person must look at and alert on each one not yet alerted:
 * refund_failed; refund_due for over 30 minutes; refund_pending for over 30
 * minutes with no Razorpay refund id. Run from a 15-minute cron.
 */
export async function sweepRefundAlerts(
  admin: SupabaseClient,
  opts: Omit<AlertOptions, 'note'> & { now?: number; limit?: number; maxEmails?: number } = {},
): Promise<Array<{ paymentId: string; kind: AlertKind; outcome: AlertOutcome }>> {
  const cutoff = new Date((opts.now ?? Date.now()) - STUCK_REFUND_MS).toISOString();
  const { data, error } = await admin
    .from('payments')
    .select('id, status, refund_id, updated_at')
    .or(
      `status.eq.refund_failed,and(status.eq.refund_due,updated_at.lt.${cutoff}),` +
        `and(status.eq.refund_pending,refund_id.is.null,updated_at.lt.${cutoff})`,
    )
    // Newest first: refund_failed rows that were already alerted stay in
    // that state for good, and must never push a NEW failure out of the
    // window. (An alerted row is only re-read while it is among the newest.)
    .order('updated_at', { ascending: false })
    .limit(opts.limit ?? 500);
  if (error) throw new Error(`refund sweep: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; status: string }>;
  if (!rows.length) return [];

  // One query for every alert already on record, so long-settled
  // refund_failed rows cost nothing on each run.
  const { data: logs } = await admin
    .from('notification_log')
    .select('status, created_at, payload')
    .eq('template', ALERT_TEMPLATE)
    .in(
      'payload->>payment_id',
      rows.map((r) => r.id),
    );
  const byPayment = new Map<string, LogRow[]>();
  for (const l of (logs ?? []) as LogRow[]) {
    const id = l.payload?.payment_id;
    if (id) byPayment.set(id, [...(byPayment.get(id) ?? []), l]);
  }

  const out: Array<{ paymentId: string; kind: AlertKind; outcome: AlertOutcome }> = [];
  // Each email can take a few seconds: keep a run well inside the cron's
  // 60 s timeout. Anything left over goes out on the next run.
  const maxEmails = opts.maxEmails ?? 5;
  for (const r of rows) {
    if (out.length >= maxEmails) break;
    if (alertSettled(byPayment.get(r.id) ?? [])) continue;
    const kind: AlertKind = r.status === 'refund_failed' ? 'refund_failed' : 'refund_stuck';
    const note =
      r.status === 'refund_due'
        ? 'Found by the 15-minute check: owed back (refund_due) and never refunded.'
        : r.status === 'refund_pending'
          ? 'Found by the 15-minute check: the refund call was started but never answered. Razorpay may or may not have refunded it.'
          : 'Found by the 15-minute check.';
    out.push({ paymentId: r.id, kind, outcome: await alertRefundProblem(admin, r.id, kind, { ...opts, note }) });
  }
  return out;
}
