// Edge Function: razorpay-webhook
//
// Razorpay → us. The source of truth for consult payments: a family who pays
// and never comes back to the app still gets their consult confirmed here.
//
// Every request must carry X-Razorpay-Signature = hex HMAC-SHA256 of the raw
// body with RAZORPAY_WEBHOOK_SECRET; anything else is rejected before the
// body is parsed. X-Razorpay-Event-Id goes into razorpay_events first, so a
// redelivered event is acknowledged without being applied twice.
//
// Events (subscribe to exactly these in the Razorpay dashboard):
//   payment_link.paid       → confirm the booking (or refund if it is gone)
//   payment_link.expired    → mark the link expired
//   payment_link.cancelled  → mark the link cancelled
//   refund.processed        → payment refunded
//   refund.failed           → payment refund_failed (needs a person)
//
// Deploy: supabase functions deploy razorpay-webhook --no-verify-jwt
// Secrets: RAZORPAY_WEBHOOK_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.

// deno-lint-ignore-file no-explicit-any
import { createAdminClient } from '../_shared/supabase.ts';
import { finalizePaidLink, verifyWebhookSignature } from '../_shared/razorpay.ts';

const ok = () => new Response('ok', { status: 200 });

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
  const eventId = req.headers.get('x-razorpay-event-id') ?? '';
  const admin = createAdminClient();

  if (eventId) {
    const { error } = await admin
      .from('razorpay_events')
      .insert({ id: eventId.slice(0, 100), event, payload: body });
    if (error) {
      // 23505: seen before. Anything else: let Razorpay retry.
      if (error.code === '23505') return ok();
      console.error(`[razorpay-webhook] event log failed: ${error.message}`);
      return new Response('Retry', { status: 500 });
    }
  }

  try {
    await handle(admin, event, body?.payload ?? {});
    return ok();
  } catch (e) {
    console.error(`[razorpay-webhook] ${event} ${eventId}: ${(e as Error).message}`);
    // Forget the event so the retry is applied.
    if (eventId) await admin.from('razorpay_events').delete().eq('id', eventId.slice(0, 100));
    return new Response('Retry', { status: 500 });
  }
});

async function paymentRowForLink(admin: any, link: any): Promise<{ id: string } | null> {
  if (!link?.id) return null;
  const { data } = await admin
    .from('payments')
    .select('id')
    .eq('razorpay_link_id', link.id)
    .maybeSingle();
  return data ?? null;
}

async function handle(admin: any, event: string, payload: any): Promise<void> {
  const now = new Date().toISOString();

  if (event === 'payment_link.paid') {
    const link = payload.payment_link?.entity;
    const payment = payload.payment?.entity;
    const row = await paymentRowForLink(admin, link);
    if (!row || !payment?.id) {
      console.warn(`[razorpay-webhook] paid link ${link?.id} is not one of ours`);
      return;
    }
    const outcome = await finalizePaidLink(admin, row.id, payment.id, Number(payment.amount));
    console.log(`[razorpay-webhook] link ${link.id} paid → ${outcome}`);
    return;
  }

  if (event === 'payment_link.expired' || event === 'payment_link.cancelled') {
    const row = await paymentRowForLink(admin, payload.payment_link?.entity);
    if (!row) return;
    await admin
      .from('payments')
      .update({ status: event === 'payment_link.expired' ? 'expired' : 'cancelled', updated_at: now })
      .eq('id', row.id)
      .eq('status', 'created');
    return;
  }

  if (event === 'refund.processed' || event === 'refund.failed') {
    const refund = payload.refund?.entity;
    if (!refund?.payment_id) return;
    const processed = event === 'refund.processed';
    await admin
      .from('payments')
      .update({
        status: processed ? 'refunded' : 'refund_failed',
        refund_id: refund.id,
        refunded_at: processed ? now : null,
        updated_at: now,
      })
      .eq('razorpay_payment_id', refund.payment_id)
      .in('status', ['refund_pending', 'refund_failed', 'paid']);
    if (!processed) console.error(`[razorpay-webhook] refund ${refund.id} FAILED — follow up by hand`);
    return;
  }
}
