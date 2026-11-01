// Edge Function: care-plan
//
// The parent's LilSteps Care Plan (₹999 / month, 3 video consults per
// billing month) on a Razorpay Subscription. Parent JWT only; doctors are
// refused. The rules live in _shared/carePlan.ts and migration 0053.
//
//   POST {action:"subscribe"}
//        → {url}                 Razorpay's subscription page (short_url) to
//                                open: native in an auth session, web as a
//                                full-page redirect (as consult payments).
//                                A plan page already made and still usable
//                                is handed back instead of a new one.
//        | {state:'active' | 'pending'}  already subscribed (pending: a
//                                renewal is being retried by Razorpay)
//        A halted plan (renewal failed for good) is ended first, so the
//        parent can start again. The amount is set on the Razorpay Plan
//        (RAZORPAY_CARE_PLAN_ID), never by the app.
//   POST {action:"status"}
//        → {plan}                get_my_care_plan() (0053) after asking
//                                Razorpay about the live subscription, so a
//                                late webhook never leaves the screen behind.
//   POST {action:"cancel"}
//        → {state:'ends', endsAt} paid month running: no renewal, usable to
//                                its end (Razorpay cancel_at_cycle_end)
//        | {state:'cancelled'}   nothing paid to run on: ended now
//        | {state:'none'}        no live plan
//
// Deploy: supabase functions deploy care-plan (verify_jwt on).
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_CARE_PLAN_ID.

// deno-lint-ignore-file no-explicit-any
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, createUserClient, getCaller } from '../_shared/supabase.ts';
import { RazorpayError } from '../_shared/razorpay.ts';
import { parentContact } from '../_shared/parentNotify.ts';
import {
  applySubscription,
  AUTH_WINDOW_MINUTES,
  cancelAtRazorpay,
  cancelPlan,
  cancelSubscription,
  carePlanRazorpayId,
  createSubscription,
  fetchSubscription,
  livePlan,
  type PlanRow,
  REUSE_MIN_MINUTES,
} from '../_shared/carePlan.ts';

const MINUTE = 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient();
  const caller = await getCaller(req, admin);
  if (!caller) return jsonResponse({ error: 'Invalid session' }, 401);

  // Parents only: the plan belongs to a parents row.
  const { data: parent } = await admin.from('parents').select('id').eq('id', caller.id).maybeSingle();
  if (!parent) return jsonResponse({ error: 'Care Plan is for parent accounts.' }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const action = body?.action;

  try {
    if (action === 'subscribe') return await subscribe(admin, caller.id);
    if (action === 'status') return await status(req, admin, caller.id);
    if (action === 'cancel') return await cancel(admin, caller.id);
    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(`[care-plan] ${action} ${caller.id}: ${(e as Error).message}`);
    if (e instanceof RazorpayError) {
      return jsonResponse({ error: 'The payment service did not answer. Please try again.' }, 502);
    }
    return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
  }
});

/** Ask Razorpay about a plan and apply it (webhook late or lost). */
async function refresh(admin: any, row: PlanRow): Promise<PlanRow | null> {
  if (!row.razorpay_subscription_id) return row;
  const sub = await fetchSubscription(row.razorpay_subscription_id);
  await applySubscription(admin, sub, Math.floor(Date.now() / 1000));
  return await livePlan(admin, row.parent_id!);
}

async function subscribe(admin: any, parentId: string): Promise<Response> {
  const planId = carePlanRazorpayId();
  if (!planId) return jsonResponse({ error: "The Care Plan isn't available yet. Please try again later." }, 503);

  let live = await livePlan(admin, parentId);
  if (live && live.status !== 'created') live = await refresh(admin, live);

  if (live?.status === 'active' || live?.status === 'authenticated') return jsonResponse({ state: 'active' });
  if (live?.status === 'pending') return jsonResponse({ state: 'pending' });
  if (live?.status === 'halted') {
    // Its renewal failed for good: end it, then start a fresh one.
    await cancelPlan(admin, live);
    live = null;
  }
  if (live?.status === 'created') {
    const left = live.auth_expires_at ? new Date(live.auth_expires_at).getTime() - Date.now() : 0;
    if (live.short_url && left > REUSE_MIN_MINUTES * MINUTE) return jsonResponse({ url: live.short_url });
    // About to run out: maybe they paid just now. Otherwise drop it.
    if (live.razorpay_subscription_id) {
      const sub = await fetchSubscription(live.razorpay_subscription_id);
      await applySubscription(admin, sub, Math.floor(Date.now() / 1000));
      if (sub.status !== 'created') return jsonResponse({ state: sub.status === 'pending' ? 'pending' : 'active' });
      await cancelAtRazorpay(live.razorpay_subscription_id, false);
    }
    await admin
      .from('care_plans')
      .update({ status: 'expired', ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', live.id)
      .eq('status', 'created');
  }

  const authUntil = new Date(Date.now() + AUTH_WINDOW_MINUTES * MINUTE);
  const { data: row, error } = await admin
    .from('care_plans')
    .insert({ parent_id: parentId, razorpay_plan_id: planId, status: 'created', auth_expires_at: authUntil.toISOString() })
    .select('id')
    .single();
  if (error?.code === '23505') {
    // care_plans_one_live_per_parent_uidx: another tap is making one now.
    return jsonResponse({ error: 'Opening the plan page already. Please try again in a moment.' }, 409);
  }
  if (error || !row) throw new Error(`care_plans insert: ${error?.message}`);

  const contact = await parentContact(admin, parentId);
  let sub;
  try {
    sub = await createSubscription({
      planId,
      carePlanId: row.id,
      parentId,
      expireBy: authUntil,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
    });
  } catch (e) {
    await admin.from('care_plans').delete().eq('id', row.id);
    throw e;
  }
  if (!sub.short_url) {
    await cancelSubscription(sub.id, false).catch(() => undefined);
    await admin.from('care_plans').update({ status: 'cancelled', razorpay_subscription_id: sub.id }).eq('id', row.id);
    return jsonResponse({ error: "Couldn't open the plan page. Please try again." }, 502);
  }

  const { error: saveErr } = await admin
    .from('care_plans')
    .update({ razorpay_subscription_id: sub.id, short_url: sub.short_url, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (saveErr) {
    // A subscription we can't find again must not take money.
    console.error(`[care-plan] could not save subscription ${sub.id} on ${row.id}: ${saveErr.message}`);
    await cancelSubscription(sub.id, false).catch(() => undefined);
    await admin.from('care_plans').update({ status: 'cancelled' }).eq('id', row.id);
    return jsonResponse({ error: "Couldn't open the plan page. Please try again." }, 502);
  }
  return jsonResponse({ url: sub.short_url });
}

async function status(req: Request, admin: any, parentId: string): Promise<Response> {
  const live = await livePlan(admin, parentId);
  if (live?.razorpay_subscription_id) {
    try {
      await refresh(admin, live);
    } catch (e) {
      // Show what we have; the webhook will catch up.
      console.warn(`[care-plan] status refresh ${live.id}: ${(e as Error).message}`);
    }
  }
  const user = createUserClient(req);
  const { data, error } = await user.rpc('get_my_care_plan');
  if (error) throw new Error(`get_my_care_plan: ${error.message}`);
  return jsonResponse({ plan: data ?? null });
}

async function cancel(admin: any, parentId: string): Promise<Response> {
  const live = await livePlan(admin, parentId);
  if (!live) return jsonResponse({ state: 'none' });
  return jsonResponse(await cancelPlan(admin, live));
}
