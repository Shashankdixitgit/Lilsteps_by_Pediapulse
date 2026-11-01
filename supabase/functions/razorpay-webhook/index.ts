// Edge Function: razorpay-webhook
//
// Razorpay → us. The source of truth for consult payments: a family who pays
// and never comes back to the app still gets their consult confirmed here.
//
// Every request must carry X-Razorpay-Signature = hex HMAC-SHA256 of the raw
// body with RAZORPAY_WEBHOOK_SECRET; anything else is rejected before the
// body is parsed. X-Razorpay-Event-Id is recorded in razorpay_events only
// AFTER the event was applied: a redelivered event that was already applied
// is acknowledged; one whose apply failed is applied again. Every handler is
// idempotent, so two deliveries racing each other are harmless. Only the
// event name, ids and amount are stored, never the payload.
//
// Events (subscribe to exactly these in the Razorpay dashboard):
//   payment_link.paid       → confirm the booking (or refund if it is gone).
//                             Matched by link id, else by the signed body's
//                             reference_id / notes.payment_id. A paid link
//                             that matches nothing is logged as an error and
//                             recorded with unmatched = true for a person.
//   payment_link.expired    → mark the link expired
//   payment_link.cancelled  → mark the link cancelled
//   refund.processed        → payment refunded
//   refund.failed           → payment refund_failed (needs a person: the
//                             team is emailed once, refundAlerts.ts)
//
// Deploy: supabase functions deploy razorpay-webhook --no-verify-jwt
// Secrets: RAZORPAY_WEBHOOK_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.

// deno-lint-ignore-file no-explicit-any
import { createAdminClient } from '../_shared/supabase.ts';
import { finalizePaidLink, verifyWebhookSignature } from '../_shared/razorpay.ts';
import { inBackground } from '../_shared/parentNotify.ts';
import { alertRefundProblem } from '../_shared/refundAlerts.ts';

const ok = () => new Response('ok', { status: 200 });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Applied {
  linkId?: string | null;
  paymentId?: string | null;
  refundId?: string | null;
  amount?: number | null;
  unmatched?: boolean;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await req.text();
  const valid = await verifyWebhookSignature(
    raw,
    req.headers.get('x-razorpay-signature'),
    Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '',
  );
  if (!valid) return new Response('Invalid signature', { status: 401 });

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const event: string = typeof body?.event === 'string' ? body.event : '';
  const eventId = (req.headers.get('x-razorpay-event-id') ?? '').slice(0, 100);
  const admin = createAdminClient();

  if (eventId) {
    const { data: seen } = await admin.from('razorpay_events').select('id').eq('id', eventId).maybeSingle();
    if (seen) return ok();
  }

  let applied: Applied;
  try {
    applied = await handle(admin, event, body?.payload ?? {});
  } catch (e) {
    console.error(`[razorpay-webhook] ${event} ${eventId}: ${(e as Error).message}`);
    return new Response('Retry', { status: 500 });
  }

  if (eventId) {
    const { error } = await admin.from('razorpay_events').insert({
      id: eventId,
      event,
      link_id: applied.linkId ?? null,
      payment_id: applied.paymentId ?? null,
      refund_id: applied.refundId ?? null,
      amount_paise: applied.amount ?? null,
      unmatched: applied.unmatched ?? false,
    });
    // 23505: a parallel delivery recorded it first. Anything else: the event
    // was applied, so don't make Razorpay retry; just log.
    if (error && error.code !== '23505') {
      console.error(`[razorpay-webhook] could not record event ${eventId}: ${error.message}`);
    }
  }
  return ok();
});

/** Our payments row for a link: by link id, else by the ids we put in it. */
async function paymentRowForLink(admin: any, link: any): Promise<{ id: string } | null> {
  if (!link) return null;
  if (link.id) {
    const { data } = await admin.from('payments').select('id').eq('razorpay_link_id', link.id).maybeSingle();
    if (data) return data;
  }
  // The body is signed, so reference_id / notes are ours: we set them to the
  // payments row id (consult-payment start). Used if saving the link id failed.
  for (const candidate of [link.reference_id, link.notes?.payment_id]) {
    if (typeof candidate === 'string' && UUID_RE.test(candidate)) {
      const { data } = await admin.from('payments').select('id').eq('id', candidate).maybeSingle();
      if (data) {
        if (link.id) {
          await admin.from('payments').update({ razorpay_link_id: link.id }).eq('id', data.id).is('razorpay_link_id', null);
        }
        return data;
      }
    }
  }
  return null;
}

async function handle(admin: any, event: string, payload: any): Promise<Applied> {
  const now = new Date().toISOString();

  if (event === 'payment_link.paid') {
    const link = payload.payment_link?.entity;
    const payment = payload.payment?.entity;
    const applied: Applied = { linkId: link?.id, paymentId: payment?.id, amount: Number(payment?.amount) || null };
    const row = await paymentRowForLink(admin, link);
    if (!row || !payment?.id) {
      console.error(
        `[razorpay-webhook] UNMATCHED PAID LINK ${link?.id} payment ${payment?.id} amount ${payment?.amount} — ` +
          'captured money with no booking here; a person must check it in the Razorpay dashboard',
      );
      return { ...applied, unmatched: true };
    }
    const outcome = await finalizePaidLink(admin, row.id, payment.id, Number(payment.amount));
    console.log(`[razorpay-webhook] link ${link.id} paid → ${outcome}`);
    return applied;
  }

  if (event === 'payment_link.expired' || event === 'payment_link.cancelled') {
    const link = payload.payment_link?.entity;
    const row = await paymentRowForLink(admin, link);
    if (row) {
      await admin
        .from('payments')
        .update({ status: event === 'payment_link.expired' ? 'expired' : 'cancelled', updated_at: now })
        .eq('id', row.id)
        .eq('status', 'created');
    }
    return { linkId: link?.id };
  }

  if (event === 'refund.processed' || event === 'refund.failed') {
    const refund = payload.refund?.entity;
    if (!refund?.payment_id) return {};
    const processed = event === 'refund.processed';
    const { data: rows, error } = await admin
      .from('payments')
      .update({
        status: processed ? 'refunded' : 'refund_failed',
        refund_id: refund.id,
        refunded_at: processed ? now : null,
        updated_at: now,
      })
      .eq('razorpay_payment_id', refund.payment_id)
      .in('status', ['refund_pending', 'refund_failed', 'refund_due', 'paid'])
      .select('id');
    if (error) throw new Error(`refund update: ${error.message}`);
    if (!processed) {
      console.error(`[razorpay-webhook] refund ${refund.id} FAILED — retried on the next status check`);
      // Once per payment (refundAlerts.ts); in the background so Razorpay
      // gets its answer at once.
      for (const r of (rows ?? []) as Array<{ id: string }>) {
        inBackground(
          'refund alert',
          alertRefundProblem(admin, r.id, 'refund_failed', { note: `Razorpay webhook refund.failed for refund ${refund.id}` }),
        );
      }
    }
    return { paymentId: refund.payment_id, refundId: refund.id, amount: Number(refund.amount) || null };
  }

  return {};
}
