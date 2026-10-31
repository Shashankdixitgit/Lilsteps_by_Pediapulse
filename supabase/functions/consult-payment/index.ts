// Edge Function: consult-payment
//
// Pay-per-consult (₹449, CONSULT_PRICE_PAISE) for a booking that book_slot
// (0045) created as 'awaiting_payment'. Called by the parent app with the
// user's JWT; the doctor dashboard may call `cancel` for its own consults.
//
//   POST {action:"start",  appointmentId, returnUrl}
//        → {url, expiresAt}   a Razorpay Payment Link to open in the browser.
//          Reuses the booking's open link; makes a new one (max 3) only when
//          the last one expired. Each new link extends the hold to cover it.
//   POST {action:"status", appointmentId, callback?}
//        → {state: 'paid' | 'pending' | 'expired' | 'cancelled'}
//          `callback` is the query Razorpay put on the return URL. Its
//          signature is verified with the key secret, but we still only mark
//          a booking paid from Razorpay's own record of the link (fetched
//          here) or from the webhook — never from what the app says.
//   POST {action:"cancel", appointmentId}
//        → {refund: 'started' | 'none' | 'not_paid', late?: true}
//          Unpaid hold: dropped, link cancelled. Paid consult: cancelled;
//          refunded in full when it is 2 h or more before the start, or when
//          the doctor cancels. Less than 2 h before (parent): no refund.
//
// The return URL is never handed to Razorpay as-is: callback_url points at
// razorpay-return, which only redirects to the app's own scheme or an
// allowed web origin.
//
// Deploy: supabase functions deploy consult-payment (verify_jwt on).
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.

// deno-lint-ignore-file no-explicit-any
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, getCaller } from '../_shared/supabase.ts';
import {
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
  REFUND_CUTOFF_MS,
  refundPaymentRow,
  verifyLinkCallbackSignature,
} from '../_shared/razorpay.ts';
import { isAllowedReturnUrl } from '../razorpay-return/allow.ts';

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
  doctors: { name: string } | null;
  parents: { phone: string | null } | null;
}

interface PaymentRow {
  id: string;
  status: string;
  razorpay_link_id: string | null;
  razorpay_link_url: string | null;
  link_expires_at: string | null;
  created_at: string;
}

/** Consult start as a Date: date + time are clinic (IST, +05:30) wall time. */
function consultStart(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 8)}+05:30`);
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
    .select('id, parent_id, doctor_id, date, time, status, cancel_reason, hold_expires_at, doctors(name), parents(phone)')
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
  // Only cancel is open to the doctor.
  if (!isParent && !(isDoctor && action === 'cancel')) {
    return jsonResponse({ error: 'Appointment not found' }, 404);
  }

  try {
    if (action === 'start') return await start(admin, appt, body?.returnUrl);
    if (action === 'status') return await status(admin, appt, callbackFrom(body?.callback));
    if (action === 'cancel') return await cancel(admin, appt, isDoctor ? 'doctor' : 'parent');
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

  // An open link with at least 2 minutes left: send the family back to it.
  const open = links.find(
    (p) =>
      p.status === 'created' &&
      p.razorpay_link_url &&
      p.link_expires_at &&
      new Date(p.link_expires_at).getTime() - now > 2 * MINUTE,
  );
  if (open) return jsonResponse({ url: open.razorpay_link_url, expiresAt: open.link_expires_at });

  if (links.length >= MAX_LINKS_PER_APPOINTMENT) {
    return jsonResponse({ state: 'expired' });
  }

  const expireBy = new Date(now + LINK_MINUTES * MINUTE);
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
  if (error || !row) throw new Error(`payments insert: ${error?.message}`);

  const callbackUrl =
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/razorpay-return?to=${encodeURIComponent(returnUrl)}`;
  let link;
  try {
    link = await createPaymentLink({
      paymentId: row.id,
      appointmentId: appt.id,
      expireBy,
      description: `Video consult with ${appt.doctors?.name ?? 'your doctor'}`.slice(0, 2048),
      callbackUrl,
      contact: appt.parents?.phone ?? null,
    });
  } catch (e) {
    await admin.from('payments').delete().eq('id', row.id);
    throw e;
  }

  await admin
    .from('payments')
    .update({ razorpay_link_id: link.id, razorpay_link_url: link.short_url, updated_at: new Date().toISOString() })
    .eq('id', row.id);

  // The hold covers the whole life of the link, plus a little for the webhook.
  const holdUntil = new Date(expireBy.getTime() + HOLD_GRACE_MINUTES * MINUTE);
  if (new Date(appt.hold_expires_at).getTime() < holdUntil.getTime()) {
    await admin
      .from('appointments')
      .update({ hold_expires_at: holdUntil.toISOString() })
      .eq('id', appt.id)
      .eq('status', 'awaiting_payment');
  }

  return jsonResponse({ url: link.short_url, expiresAt: expireBy.toISOString() });
}

// ── status ──────────────────────────────────────────────────────────────────

async function status(admin: any, appt: Appointment, cb: LinkCallback | null): Promise<Response> {
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
  // ignored (logged), not trusted.
  if (cb) {
    const ok = await verifyLinkCallbackSignature(cb, Deno.env.get('RAZORPAY_KEY_SECRET') ?? '');
    if (!ok) {
      console.warn(`[consult-payment] callback signature mismatch for appointment ${appt.id}`);
    } else {
      const hit = links.find((p) => p.razorpay_link_id === cb.razorpay_payment_link_id);
      if (hit) links = [hit, ...links.filter((p) => p !== hit)];
    }
  }

  // Ask Razorpay about every link that might have been paid.
  for (const p of links) {
    if (p.status !== 'created' && p.status !== 'expired') continue;
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
      if (outcome === 'refunded') return jsonResponse({ state: 'expired', refunded: true });
    } else if (link.status === 'expired' || link.status === 'cancelled') {
      if (p.status === 'created') {
        await admin.from('payments').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', p.id).eq('status', 'created');
      }
    }
  }

  if (appt.status === 'cancelled') {
    return jsonResponse({ state: appt.cancel_reason === 'payment_expired' ? 'expired' : 'cancelled' });
  }
  if (!appt.hold_expires_at || new Date(appt.hold_expires_at).getTime() <= Date.now()) {
    return jsonResponse({ state: 'expired' });
  }
  return jsonResponse({ state: 'pending', holdExpiresAt: appt.hold_expires_at });
}

// ── cancel ──────────────────────────────────────────────────────────────────

async function cancel(admin: any, appt: Appointment, by: 'parent' | 'doctor'): Promise<Response> {
  if (appt.status === 'cancelled') return jsonResponse({ refund: 'none' });
  if (appt.status !== 'upcoming' && appt.status !== 'awaiting_payment') {
    return jsonResponse({ error: 'This consult has already happened.' }, 409);
  }

  const { data: updated } = await admin
    .from('appointments')
    .update({ status: 'cancelled', cancel_reason: by, hold_expires_at: null })
    .eq('id', appt.id)
    .eq('status', appt.status)
    .select('id')
    .maybeSingle();
  if (!updated) return jsonResponse({ error: 'This consult changed. Please refresh.' }, 409);

  const { data: rows } = await admin
    .from('payments')
    .select('id, status, razorpay_link_id')
    .eq('appointment_id', appt.id);
  const payments = (rows ?? []) as PaymentRow[];

  // Stop any open link from taking money for a cancelled booking.
  for (const p of payments) {
    if (p.status === 'created' && p.razorpay_link_id) {
      await cancelPaymentLink(p.razorpay_link_id);
      await admin.from('payments').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', p.id).eq('status', 'created');
    }
  }

  const paid = payments.find((p) => p.status === 'paid');
  if (!paid) return jsonResponse({ refund: 'not_paid' });

  const early = consultStart(appt.date, appt.time).getTime() - Date.now() >= REFUND_CUTOFF_MS;
  if (by === 'parent' && !early) return jsonResponse({ refund: 'none', late: true });

  const result = await refundPaymentRow(admin, paid.id, by === 'doctor' ? 'doctor_cancelled' : 'parent_cancelled');
  return jsonResponse({ refund: result === 'not_paid' ? 'not_paid' : 'started' });
}
