// Edge Function: consult-payment
//
// Pay-per-consult (₹449, CONSULT_PRICE_PAISE) for a booking that hold_slot
// (0045) or book_followup (0051) created as 'awaiting_payment'. Called by the
// parent app with the user's JWT; the doctor dashboard may call `cancel`,
// `reschedule` and `followup` for its own consults.
//
//   POST {action:"start",  appointmentId, returnUrl}
//        → {url, expiresAt}   a Razorpay Payment Link to open in the browser.
//          Reuses the booking's open link while it has 2+ minutes left;
//          otherwise cancels it and makes a new one (max 3 per booking).
//          payments_one_open_link_uidx (0045) keeps it to one open link even
//          if two starts race. Each new link extends the hold to cover it.
//   POST {action:"status", appointmentId, callback?}
//        → {state: 'paid' | 'pending' | 'expired' | 'cancelled',
//           refunded?, refundFailed?, holdExpiresAt?}
//          Also retries any refund this booking still owes (refund_due /
//          refund_failed) — with the webhook, the retry path for refunds.
//          `callback` is the query Razorpay put on the return URL. Its
//          signature is verified with the key secret, but we still only mark
//          a booking paid from Razorpay's own record of the link (fetched
//          here) or from the webhook — never from what the app says.
//   POST {action:"cancel", appointmentId}
//        → {refund: 'started' | 'failed' | 'none' | 'not_paid', late?: true}
//          Unpaid hold: dropped, link cancelled. Paid consult: cancelled;
//          refunded in full when it is 2 h or more before the start, or when
//          the doctor cancels. Less than 2 h before (parent): no refund,
//          unless the doctor moved the consult in the last 24 h (then full).
//          A doctor may drop an unpaid hold only if it is a follow-up they
//          booked (followup_of); any other family's hold is not theirs.
//   POST {action:"reschedule", appointmentId, slotId}            parent / doctor
//        → {appointment: {id, date, time, reschedule_count}}
//          Free: moves an upcoming PAID consult to another open slot of the
//          same doctor (reschedule_appointment, 0051, run as the caller so
//          it checks who they are; parent: 2 h or more before the start;
//          the new time 2 h or more from now for everyone).
//          The payment and the Meet room stay. The family gets the
//          'appointment_rescheduled' email (once per new time).
//   POST {action:"use_plan", appointmentId}                       parent only
//        → {state: 'paid', plan: true} | {state: 'no_credit' | 'no_plan' | 'expired'}
//          Confirms a held booking with one of this month's Care Plan
//          consults instead of ₹449 (confirm_consult_with_plan, 0053: the
//          plan month row is locked, so two bookings can't both take the
//          last one). Open Payment Links of the booking are cancelled; the
//          Meet room and the confirmation email follow exactly as after a
//          payment (afterConsultConfirmed). 'no_credit' / 'no_plan': the
//          hold stays, so the family can still pay ₹449 for it.
//        Cancelling a plan consult (action cancel) answers
//        {refund: 'not_paid', plan: 'returned' | 'rebook_owed'} or
//        {refund: 'none', late: true, plan: 'used'} (_shared/consultCancel.ts).
//   POST {action:"followup", appointmentId, slotId}              doctor only
//        appointmentId = the COMPLETED consult the follow-up is for.
//        → {appointmentId, holdExpiresAt, emailed}
//          book_followup (0051) holds the slot for the family
//          ('awaiting_payment', up to 24 h, released 1 h before the slot),
//          a Payment Link is made for the whole hold, and the family is
//          emailed it ('followup_payment_request'). Paying confirms it
//          through the webhook like any booking. If no link can be made the
//          hold is dropped again.
//
// The return URL is never handed to Razorpay as-is: callback_url points at
// razorpay-return, which only redirects to the app's own scheme or an
// allowed web origin.
//
// Deploy: supabase functions deploy consult-payment (verify_jwt on).
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.

// deno-lint-ignore-file no-explicit-any
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, createUserClient, getCaller } from '../_shared/supabase.ts';
import { cancelConsult } from '../_shared/consultCancel.ts';
import {
  emailPaymentReturnUrl,
  followupLinkExpiry,
  istParts,
  startsAtKey,
} from '../_shared/schedule.ts';
import { formatEmailDate, formatEmailTime } from '../_shared/templates.ts';
import {
  afterConsultConfirmed,
  cancelPaymentLink,
  CONSULT_PRICE_PAISE,
  createPaymentLink,
  fetchPaymentLink,
  finalizePaidLink,
  HOLD_GRACE_MINUTES,
  LINK_MINUTES,
  type LinkCallback,
  MAX_LINKS_PER_APPOINTMENT,
  RazorpayError,
  retryOwedRefunds,
  verifyLinkCallbackSignature,
} from '../_shared/razorpay.ts';
import { isAllowedReturnUrl } from '../razorpay-return/allow.ts';
import { inBackground, notifyParent, parentContact } from '../_shared/parentNotify.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTE = 60 * 1000;

interface Appointment {
  id: string;
  parent_id: string;
  doctor_id: string;
  date: string;
  time: string;
  status: string;
  cancel_reason: string | null;
  hold_expires_at: string | null;
  child_id: string;
  followup_of: string | null;
  last_rescheduled_by: string | null;
  rescheduled_at: string | null;
  doctors: { name: string } | null;
  children: { name: string } | null;
}

/** What reschedule_appointment / book_followup return (an appointments row). */
interface AppointmentRow {
  id: string;
  parent_id: string;
  doctor_id: string;
  child_id: string;
  date: string;
  time: string;
  status: string;
  hold_expires_at: string | null;
  reschedule_count: number;
}

interface PaymentRow {
  id: string;
  status: string;
  razorpay_link_id: string | null;
  razorpay_link_url: string | null;
  link_expires_at: string | null;
  created_at: string;
}

function callbackFrom(raw: any): LinkCallback | null {
  if (!raw || typeof raw !== 'object') return null;
  const keys = [
    'razorpay_payment_id',
    'razorpay_payment_link_id',
    'razorpay_payment_link_reference_id',
    'razorpay_payment_link_status',
    'razorpay_signature',
  ] as const;
  const out: Record<string, string> = {};
  for (const k of keys) {
    if (typeof raw[k] !== 'string' || raw[k].length > 200) return null;
    out[k] = raw[k];
  }
  return out as unknown as LinkCallback;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient();
  const caller = await getCaller(req, admin);
  if (!caller) return jsonResponse({ error: 'Invalid session' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const action = body?.action;
  const appointmentId = body?.appointmentId;
  if (typeof appointmentId !== 'string' || !UUID_RE.test(appointmentId)) {
    return jsonResponse({ error: 'Missing appointmentId' }, 400);
  }

  const { data: appt } = await admin
    .from('appointments')
    .select(
      'id, parent_id, doctor_id, child_id, date, time, status, cancel_reason, hold_expires_at, followup_of, ' +
        'last_rescheduled_by, rescheduled_at, doctors(name), children(name)',
    )
    .eq('id', appointmentId)
    .maybeSingle<Appointment>();
  if (!appt) return jsonResponse({ error: 'Appointment not found' }, 404);

  const isParent = appt.parent_id === caller.id;
  let isDoctor = false;
  if (!isParent) {
    const { data: doctorAuth } = await admin
      .from('doctor_auth')
      .select('doctor_id')
      .eq('id', caller.id)
      .maybeSingle();
    isDoctor = doctorAuth?.doctor_id === appt.doctor_id;
  }
  // The doctor may cancel, move, or book a follow-up from their own consult.
  // A follow-up is the doctor's alone; paying is the family's alone.
  const doctorAction = action === 'cancel' || action === 'reschedule' || action === 'followup';
  if (!(isParent && action !== 'followup') && !(isDoctor && doctorAction)) {
    return jsonResponse({ error: 'Appointment not found' }, 404);
  }
  const slotId = body?.slotId;
  if ((action === 'reschedule' || action === 'followup') && (typeof slotId !== 'string' || !UUID_RE.test(slotId))) {
    return jsonResponse({ error: 'Missing slotId' }, 400);
  }

  try {
    if (action === 'start') return await start(admin, appt, body?.returnUrl);
    if (action === 'status') return await status(admin, appt, callbackFrom(body?.callback));
    if (action === 'use_plan') return await usePlan(admin, appt);
    if (action === 'cancel') return await cancel(admin, appt, isDoctor ? 'doctor' : 'parent');
    if (action === 'reschedule') return await reschedule(req, admin, appt, isDoctor ? 'doctor' : 'parent', slotId);
    if (action === 'followup') return await followup(req, admin, appt, slotId);
    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[consult-payment] ${action} ${appointmentId}: ${msg}`);
    if (e instanceof RazorpayError) {
      return jsonResponse({ error: 'The payment service did not answer. Please try again.' }, 502);
    }
    return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
  }
});

// ── start ───────────────────────────────────────────────────────────────────

async function start(admin: any, appt: Appointment, returnUrl: unknown): Promise<Response> {
  if (typeof returnUrl !== 'string' || !isAllowedReturnUrl(returnUrl)) {
    return jsonResponse({ error: 'Invalid returnUrl' }, 400);
  }
  if (appt.status === 'upcoming') return jsonResponse({ state: 'paid' });
  const now = Date.now();
  if (
    appt.status !== 'awaiting_payment' ||
    !appt.hold_expires_at ||
    new Date(appt.hold_expires_at).getTime() <= now
  ) {
    return jsonResponse({ state: 'expired' });
  }

  const { data: rows } = await admin
    .from('payments')
    .select('id, status, razorpay_link_id, razorpay_link_url, link_expires_at, created_at')
    .eq('appointment_id', appt.id)
    .order('created_at', { ascending: false });
  const links = (rows ?? []) as PaymentRow[];

  // The open link, if any. With at least 2 minutes left, send the family
  // back to it; otherwise cancel it so it can't take money for a link we
  // are about to replace.
  const open = links.find((p) => p.status === 'created');
  if (
    open?.razorpay_link_url &&
    open.link_expires_at &&
    new Date(open.link_expires_at).getTime() - now > 2 * MINUTE
  ) {
    return jsonResponse({ url: open.razorpay_link_url, expiresAt: open.link_expires_at });
  }
  if (open) {
    if (open.razorpay_link_id) await cancelPaymentLink(open.razorpay_link_id);
    await admin
      .from('payments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', open.id)
      .eq('status', 'created');
  }

  if (links.length >= MAX_LINKS_PER_APPOINTMENT) {
    return jsonResponse({ state: 'expired' });
  }

  const expireBy = new Date(now + LINK_MINUTES * MINUTE);
  const made = await createLinkForHold(admin, appt, returnUrl, expireBy);
  if ('error' in made) return made.error;

  // The hold covers the whole life of the link, plus a little for the webhook.
  const holdUntil = new Date(expireBy.getTime() + HOLD_GRACE_MINUTES * MINUTE);
  if (new Date(appt.hold_expires_at).getTime() < holdUntil.getTime()) {
    await admin
      .from('appointments')
      .update({ hold_expires_at: holdUntil.toISOString() })
      .eq('id', appt.id)
      .eq('status', 'awaiting_payment');
  }

  return jsonResponse({ url: made.url, expiresAt: expireBy.toISOString() });
}

/**
 * A new Razorpay Payment Link for a held booking, recorded in payments
 * (one open link per booking: payments_one_open_link_uidx). Shared by
 * `start` (16-minute links the app opens) and `followup` (one link for the
 * whole hold, emailed). The caller has already dealt with any open link.
 */
async function createLinkForHold(
  admin: any,
  appt: Pick<Appointment, 'id' | 'parent_id' | 'doctors'>,
  returnUrl: string,
  expireBy: Date,
): Promise<{ url: string } | { error: Response }> {
  const { data: row, error } = await admin
    .from('payments')
    .insert({
      appointment_id: appt.id,
      parent_id: appt.parent_id,
      amount_paise: CONSULT_PRICE_PAISE,
      link_expires_at: expireBy.toISOString(),
    })
    .select('id')
    .single();
  if (error?.code === '23505') {
    // Another start for this booking is making a link right now.
    return { error: jsonResponse({ error: 'Opening the payment page already. Please try again in a moment.' }, 409) };
  }
  if (error || !row) throw new Error(`payments insert: ${error?.message}`);

  const callbackUrl =
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/razorpay-return?to=${encodeURIComponent(returnUrl)}`;
  // Prefill Razorpay's page with the parent's sign-in email (and phone, if any).
  const contact = await parentContact(admin, appt.parent_id);
  let link;
  try {
    link = await createPaymentLink({
      paymentId: row.id,
      appointmentId: appt.id,
      expireBy,
      description: `Video consult with ${appt.doctors?.name ?? 'your doctor'}`.slice(0, 2048),
      callbackUrl,
      contact: contact.phone ?? null,
      email: contact.email ?? null,
    });
  } catch (e) {
    await admin.from('payments').delete().eq('id', row.id);
    throw e;
  }

  const { error: saveErr } = await admin
    .from('payments')
    .update({ razorpay_link_id: link.id, razorpay_link_url: link.short_url, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (saveErr) {
    // A link we can't find again must not take money.
    console.error(`[consult-payment] could not save link ${link.id} on row ${row.id}: ${saveErr.message}`);
    await cancelPaymentLink(link.id);
    await admin.from('payments').update({ status: 'cancelled' }).eq('id', row.id);
    return { error: jsonResponse({ error: "Couldn't open the payment page. Please try again." }, 502) };
  }
  return { url: link.short_url };
}

// ── status ──────────────────────────────────────────────────────────────────

async function status(admin: any, appt: Appointment, cb: LinkCallback | null): Promise<Response> {
  // Money this booking still owes back: try again now.
  const retried = await retryOwedRefunds(admin, appt.id);

  if (appt.status === 'upcoming' || appt.status === 'completed' || appt.status === 'no_show') {
    return jsonResponse({ state: 'paid' });
  }

  const { data: rows } = await admin
    .from('payments')
    .select('id, status, razorpay_link_id, razorpay_link_url, link_expires_at, created_at')
    .eq('appointment_id', appt.id)
    .not('razorpay_link_id', 'is', null)
    .order('created_at', { ascending: false });
  let links = (rows ?? []) as PaymentRow[];

  // A signed callback tells us which link to check first. A bad signature is
  // ignored (logged), not trusted. Either way only Razorpay's own record of
  // the link, fetched below, can mark anything paid.
  if (cb) {
    const ok = await verifyLinkCallbackSignature(cb, Deno.env.get('RAZORPAY_KEY_SECRET') ?? '');
    if (!ok) {
      console.warn(`[consult-payment] callback signature mismatch for appointment ${appt.id}`);
    } else {
      const hit = links.find((p) => p.razorpay_link_id === cb.razorpay_payment_link_id);
      if (hit) links = [hit, ...links.filter((p) => p !== hit)];
    }
  }

  let refundStarted = retried === 'refunded' || retried === 'refund_pending';
  let refundFailed = retried === 'refund_failed';

  // Ask Razorpay about every link that might have been paid.
  for (const p of links) {
    if (p.status !== 'created' && p.status !== 'expired' && p.status !== 'cancelled') continue;
    const link = await fetchPaymentLink(p.razorpay_link_id!);
    if (link.reference_id && link.reference_id !== p.id) continue;
    if (link.status === 'paid') {
      const paid = (link.payments ?? []).find((x) => x.status === 'captured') ?? (link.payments ?? [])[0];
      if (!paid) continue;
      const outcome = await finalizePaidLink(admin, p.id, paid.payment_id, paid.amount);
      if (outcome === 'confirmed' || outcome === 'already') {
        const { data: fresh } = await admin.from('appointments').select('status').eq('id', appt.id).maybeSingle();
        if (fresh?.status === 'upcoming') return jsonResponse({ state: 'paid' });
      }
      if (outcome === 'refund_started') refundStarted = true;
      if (outcome === 'refund_failed') refundFailed = true;
    } else if (link.status === 'expired' || link.status === 'cancelled') {
      if (p.status === 'created') {
        await admin
          .from('payments')
          .update({ status: link.status, updated_at: new Date().toISOString() })
          .eq('id', p.id)
          .eq('status', 'created');
      }
    }
  }

  const refund = { refunded: refundStarted || undefined, refundFailed: refundFailed || undefined };
  if (appt.status === 'cancelled') {
    return jsonResponse({ state: appt.cancel_reason === 'payment_expired' ? 'expired' : 'cancelled', ...refund });
  }
  if (!appt.hold_expires_at || new Date(appt.hold_expires_at).getTime() <= Date.now()) {
    return jsonResponse({ state: 'expired', ...refund });
  }
  return jsonResponse({ state: 'pending', holdExpiresAt: appt.hold_expires_at, ...refund });
}

// ── cancel ──────────────────────────────────────────────────────────────────

async function cancel(admin: any, appt: Appointment, by: 'parent' | 'doctor'): Promise<Response> {
  // A family's unpaid hold is theirs alone: a doctor may only withdraw a
  // follow-up they booked themselves. (A doctor-cancelled hold must never
  // become a way into a stranger's chat or records.)
  if (by === 'doctor' && appt.status === 'awaiting_payment' && !appt.followup_of) {
    return jsonResponse({ error: 'Appointment not found' }, 404);
  }

  // Shared with delete-account: cancel, stop open links, refund by the rules.
  const result = await cancelConsult(admin, appt, { by });
  if (!result.done) {
    if (result.why === 'already_cancelled') return jsonResponse({ refund: 'none' });
    if (result.why === 'not_cancellable') return jsonResponse({ error: 'This consult has already happened.' }, 409);
    return jsonResponse({ error: 'This consult changed. Please refresh.' }, 409);
  }
  const outcome = {
    refund: result.refund,
    ...(result.late ? { late: true as const } : {}),
    ...(result.plan ? { plan: result.plan } : {}),
  };

  // A booked consult (not an unpaid hold) gets a cancellation email, sent in
  // the background: the cancel answer never waits for (or fails on) email.
  if (appt.status === 'upcoming') {
    const line =
      result.plan === 'returned' ? 'plan_returned'
      : result.plan === 'used' ? 'plan_used'
      : result.plan === 'rebook_owed' ? 'plan_rebook'
      : outcome.refund === 'none' ? 'late'
      : outcome.refund;
    inBackground('cancel email', emailCancellation(admin, appt, by, line));
  }
  return jsonResponse(outcome);
}

/** Best effort: the cancel stands whether or not the email goes out. */
async function emailCancellation(
  admin: any,
  appt: Appointment,
  by: 'parent' | 'doctor',
  /** templates.ts REFUND_LINES key. */
  refundLine: string,
): Promise<void> {
  try {
    await notifyParent(admin, {
      parentId: appt.parent_id,
      childId: appt.child_id,
      appointmentId: appt.id,
      template: 'appointment_cancelled',
      params: {
        doctor: appt.doctors?.name ?? 'your doctor',
        child: appt.children?.name ?? '',
        date: appt.date,
        time: String(appt.time).slice(0, 5),
        by,
        refund: refundLine,
      },
    });
  } catch (e) {
    console.error(`[consult-payment] cancel email ${appt.id}: ${(e as Error).message}`);
  }
}

// ── use_plan ────────────────────────────────────────────────────────────────

async function usePlan(admin: any, appt: Appointment): Promise<Response> {
  if (appt.status === 'upcoming') {
    const { data } = await admin.from('appointments').select('paid_with_plan').eq('id', appt.id).maybeSingle();
    return jsonResponse(data?.paid_with_plan ? { state: 'paid', plan: true } : { state: 'paid' });
  }
  const { data, error } = await admin.rpc('confirm_consult_with_plan', {
    p_appointment_id: appt.id,
    p_parent_id: appt.parent_id,
  });
  if (error) throw new Error(`confirm_consult_with_plan: ${error.message}`);
  const outcome = data as string;
  if (outcome === 'confirmed' || outcome === 'already') {
    if (outcome === 'confirmed') {
      // The booking's links were marked cancelled in the same transaction;
      // stop them at Razorpay too. A link paid a moment ago is refunded by
      // confirm_consult_payment (the consult is already booked).
      const { data: links } = await admin
        .from('payments')
        .select('razorpay_link_id')
        .eq('appointment_id', appt.id)
        .eq('status', 'cancelled')
        .not('razorpay_link_id', 'is', null);
      for (const l of (links ?? []) as Array<{ razorpay_link_id: string | null }>) {
        if (l.razorpay_link_id) await cancelPaymentLink(l.razorpay_link_id);
      }
      await afterConsultConfirmed(admin, appt.id);
    }
    return jsonResponse({ state: 'paid', plan: true });
  }
  if (outcome === 'no_credit' || outcome === 'no_plan') return jsonResponse({ state: outcome });
  if (outcome === 'unknown') return jsonResponse({ error: 'Appointment not found' }, 404);
  return jsonResponse({ state: 'expired' });
}

// ── reschedule ──────────────────────────────────────────────────────────────

/** A refusal from our own RPCs (P0001 / P0002 / 42501) is written for people. */
function rpcRefusal(error: { code?: string; message?: string } | null): Response | null {
  if (!error) return null;
  if (error.code === 'P0001' || error.code === 'P0002' || error.code === '42501' || error.code === '28000') {
    return jsonResponse({ error: error.message ?? 'This could not be done.' }, 409);
  }
  return null;
}

async function reschedule(
  req: Request,
  admin: any,
  appt: Appointment,
  by: 'parent' | 'doctor',
  slotId: string,
): Promise<Response> {
  // As the caller: the RPC itself checks who they are and every rule.
  const user = createUserClient(req);
  const { data, error } = await user
    .rpc('reschedule_appointment', { p_appointment_id: appt.id, p_new_slot_id: slotId })
    .single();
  const refused = rpcRefusal(error);
  if (refused) return refused;
  if (error || !data) throw new Error(`reschedule_appointment: ${error?.message}`);
  const moved = data as AppointmentRow;

  inBackground('reschedule email', emailReschedule(admin, appt, moved, by));
  return jsonResponse({
    appointment: { id: moved.id, date: moved.date, time: String(moved.time).slice(0, 5), reschedule_count: moved.reschedule_count },
  });
}

/** Once per new consult time (0051 index on payload.starts_at). */
async function emailReschedule(admin: any, appt: Appointment, moved: AppointmentRow, by: 'parent' | 'doctor'): Promise<void> {
  try {
    await notifyParent(admin, {
      parentId: appt.parent_id,
      childId: appt.child_id,
      appointmentId: appt.id,
      template: 'appointment_rescheduled',
      params: {
        doctor: appt.doctors?.name ?? 'your doctor',
        child: appt.children?.name ?? '',
        date: moved.date,
        time: String(moved.time).slice(0, 5),
        by,
      },
      payload: { starts_at: startsAtKey(moved.date, String(moved.time), moved.reschedule_count) },
    });
  } catch (e) {
    console.error(`[consult-payment] reschedule email ${appt.id}: ${(e as Error).message}`);
  }
}

// ── followup ────────────────────────────────────────────────────────────────

async function followup(req: Request, admin: any, from: Appointment, slotId: string): Promise<Response> {
  const user = createUserClient(req);
  const { data, error } = await user
    .rpc('book_followup', { p_from_appointment_id: from.id, p_slot_id: slotId })
    .single();
  const refused = rpcRefusal(error);
  if (refused) return refused;
  if (error || !data) throw new Error(`book_followup: ${error?.message}`);
  const hold = data as AppointmentRow;

  const expireBy = followupLinkExpiry(hold.hold_expires_at!, HOLD_GRACE_MINUTES);
  let made: { url: string } | { error: Response };
  try {
    made = await createLinkForHold(
      admin,
      { id: hold.id, parent_id: hold.parent_id, doctors: from.doctors },
      emailPaymentReturnUrl(Deno.env.get('PAYMENT_RETURN_ORIGINS')),
      expireBy,
    );
  } catch (e) {
    made = { error: jsonResponse({ error: 'The payment service did not answer. Please try again.' }, 502) };
    console.error(`[consult-payment] followup link ${hold.id}: ${(e as Error).message}`);
  }
  if ('error' in made) {
    // No link, no follow-up: give the slot back (release_appointment_slot).
    await admin
      .from('appointments')
      .update({ status: 'cancelled', cancel_reason: 'doctor', hold_expires_at: null })
      .eq('id', hold.id)
      .eq('status', 'awaiting_payment');
    return made.error;
  }

  const until = istParts(new Date(hold.hold_expires_at!));
  let emailed = false;
  try {
    const sent = await notifyParent(admin, {
      parentId: hold.parent_id,
      childId: hold.child_id,
      appointmentId: hold.id,
      template: 'followup_payment_request',
      params: {
        doctor: from.doctors?.name ?? 'your doctor',
        child: from.children?.name ?? '',
        date: hold.date,
        time: String(hold.time).slice(0, 5),
        link: made.url,
        price: '₹449',
        until: `${formatEmailDate(until.date)} at ${formatEmailTime(until.time)}`,
      },
      channels: ['email', 'push'],
    });
    emailed = sent.some((r) => r.channel === 'email' && r.ok);
  } catch (e) {
    console.error(`[consult-payment] followup email ${hold.id}: ${(e as Error).message}`);
  }

  return jsonResponse({ appointmentId: hold.id, holdExpiresAt: hold.hold_expires_at, emailed });
}
