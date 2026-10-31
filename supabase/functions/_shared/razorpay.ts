// Razorpay helpers shared by consult-payment and razorpay-webhook.
//
// Pay-per-consult uses Payment Links: the app opens the link's short_url in
// an in-app browser, Razorpay's hosted page takes the payment, and we learn
// the result from the webhook (payment_link.paid) or by asking Razorpay when
// the app comes back. Either path ends in finalizePaidLink(), which is
// idempotent, so both may run.
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (test keys until KYC is
// approved), RAZORPAY_WEBHOOK_SECRET (set when creating the webhook in the
// Razorpay dashboard).

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';

/** ₹449 per consult. The only place the price is set; the app never sends it. */
export const CONSULT_PRICE_PAISE = 44900;

/** Razorpay needs expire_by at least 15 min ahead; 16 leaves clock slack. */
export const LINK_MINUTES = 16;
/** The held slot outlives its link by a little, for a late webhook. */
export const HOLD_GRACE_MINUTES = 4;
/** New links per booking, so a family can't keep a slot held forever. */
export const MAX_LINKS_PER_APPOINTMENT = 3;
/** Cancelling at least this long before the start refunds the payment. */
export const REFUND_CUTOFF_MS = 2 * 60 * 60 * 1000;

const API = 'https://api.razorpay.com/v1';

export class RazorpayError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function authHeader(): string {
  const id = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
  const secret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
  if (!id || !secret) throw new RazorpayError('Razorpay keys not configured', 500);
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    // Razorpay error bodies are logged, never returned to the app.
    console.error(`[razorpay] ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    throw new RazorpayError(`Razorpay ${res.status}`, res.status);
  }
  return text ? JSON.parse(text) : {};
}

export interface PaymentLink {
  id: string;
  short_url: string;
  status: 'created' | 'partially_paid' | 'paid' | 'expired' | 'cancelled';
  amount: number;
  reference_id?: string;
  payments?: Array<{ payment_id: string; amount: number; status: string }> | null;
}

export function createPaymentLink(input: {
  paymentId: string;
  appointmentId: string;
  expireBy: Date;
  description: string;
  callbackUrl: string;
  contact?: string | null;
}): Promise<PaymentLink> {
  return call('POST', '/payment_links', {
    amount: CONSULT_PRICE_PAISE,
    currency: 'INR',
    accept_partial: false,
    expire_by: Math.floor(input.expireBy.getTime() / 1000),
    reference_id: input.paymentId,
    description: input.description,
    customer: input.contact ? { contact: input.contact } : undefined,
    // The app shows the link itself; no Razorpay SMS/email to the family.
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: { appointment_id: input.appointmentId, payment_id: input.paymentId },
    callback_url: input.callbackUrl,
    callback_method: 'get',
  });
}

export function fetchPaymentLink(linkId: string): Promise<PaymentLink> {
  return call('GET', `/payment_links/${encodeURIComponent(linkId)}`);
}

export async function cancelPaymentLink(linkId: string): Promise<void> {
  try {
    await call('POST', `/payment_links/${encodeURIComponent(linkId)}/cancel`);
  } catch {
    // Already paid / expired / cancelled — nothing to do.
  }
}

export function refundPayment(
  razorpayPaymentId: string,
  amountPaise: number,
  reason: string,
): Promise<{ id: string; status: string }> {
  return call('POST', `/payments/${encodeURIComponent(razorpayPaymentId)}/refund`, {
    amount: amountPaise,
    speed: 'normal',
    notes: { reason },
  });
}

// ── Webhook signature ──────────────────────────────────────────────────────

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** X-Razorpay-Signature = hex HMAC-SHA256 of the raw body with the webhook secret. */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}

/**
 * The query Razorpay adds to a Payment Link's callback_url is signed with the
 * KEY SECRET: hex HMAC-SHA256 of
 * `payment_link_id|payment_link_reference_id|payment_link_status|razorpay_payment_id`.
 */
export interface LinkCallback {
  razorpay_payment_id: string;
  razorpay_payment_link_id: string;
  razorpay_payment_link_reference_id: string;
  razorpay_payment_link_status: string;
  razorpay_signature: string;
}

export async function verifyLinkCallbackSignature(
  cb: LinkCallback,
  keySecret: string,
): Promise<boolean> {
  if (!keySecret || !cb.razorpay_signature) return false;
  const message = [
    cb.razorpay_payment_link_id,
    cb.razorpay_payment_link_reference_id,
    cb.razorpay_payment_link_status,
    cb.razorpay_payment_id,
  ].join('|');
  const expected = await hmacSha256Hex(keySecret, message);
  return timingSafeEqual(expected, cb.razorpay_signature.trim().toLowerCase());
}

// ── Recording a paid link ──────────────────────────────────────────────────

export type FinalizeOutcome = 'confirmed' | 'already' | 'refunded' | 'unknown';

/**
 * Record a captured payment for one of our payments rows and settle the
 * booking. Safe to call more than once for the same payment.
 */
export async function finalizePaidLink(
  admin: SupabaseClient,
  paymentRowId: string,
  razorpayPaymentId: string,
  amountPaise: number,
): Promise<FinalizeOutcome> {
  const { data, error } = await admin.rpc('confirm_consult_payment', {
    p_payment_id: paymentRowId,
    p_razorpay_payment_id: razorpayPaymentId,
    p_amount_paise: amountPaise,
  });
  if (error) throw new Error(`confirm_consult_payment: ${error.message}`);

  if (data === 'refund_needed') {
    await refundPaymentRow(admin, paymentRowId, 'no_consult_for_payment');
    return 'refunded';
  }
  return data as FinalizeOutcome;
}

/**
 * Refund a paid payments row in full and record it. The row is marked
 * refund_pending BEFORE calling Razorpay so a retry never refunds twice;
 * a Razorpay failure leaves refund_failed for someone to follow up.
 */
export async function refundPaymentRow(
  admin: SupabaseClient,
  paymentRowId: string,
  reason: string,
): Promise<'refund_pending' | 'refunded' | 'refund_failed' | 'not_paid'> {
  const { data: claimed } = await admin
    .from('payments')
    .update({ status: 'refund_pending', refund_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', paymentRowId)
    .eq('status', 'paid')
    .select('id, razorpay_payment_id, amount_paise')
    .maybeSingle();
  if (!claimed?.razorpay_payment_id) return 'not_paid';

  try {
    const refund = await refundPayment(claimed.razorpay_payment_id, claimed.amount_paise, reason);
    const done = refund.status === 'processed';
    await admin
      .from('payments')
      .update({
        refund_id: refund.id,
        status: done ? 'refunded' : 'refund_pending',
        refunded_at: done ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentRowId);
    return done ? 'refunded' : 'refund_pending';
  } catch (e) {
    console.error(`[razorpay] refund failed for payment row ${paymentRowId}: ${(e as Error).message}`);
    await admin
      .from('payments')
      .update({ status: 'refund_failed', updated_at: new Date().toISOString() })
      .eq('id', paymentRowId);
    return 'refund_failed';
  }
}
