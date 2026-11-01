// Edge Function: delete-account
//
// In-app account deletion (Apple App Store guideline 5.1.1(v), Google Play
// account-deletion policy). Called from Profile → Privacy & security →
// "Delete my account" with the signed-in parent's session.
//
// First, a live Care Plan is ended at Razorpay right away (no more
// charges); if Razorpay can't confirm that, nothing is deleted and the
// parent is asked to try again. Plan consults follow the plan credit rule
// (moot once the account is gone).
// Then (account.ts settleConsultsBeforeDelete): every consult that has not
// started yet and every unpaid hold is cancelled through the consult-payment
// cancel code, with the same refund rules as a parent cancel (in full 2 h or
// more before the start, or if the doctor moved it in the last 24 h; else no
// refund). Consults whose start has passed are left alone (no refund).
// Refunds the account was still owed are retried. A failed refund does not stop the deletion: the payments row stays
// refund_failed (parent_id → null) and the team is emailed once.
//
// What it deletes (policy: everything the parent put in or that is about
// their children; nothing that belongs to a doctor):
//   1. Files in Storage
//        documents/<parent_id>/**            (uploaded health records)
//        health-photos/<parent_id>/**        (health-log photos)
//        prescriptions/<prescription_id>/**  (PDFs for this parent's children)
//   2. notification_log rows for the parent or their children (they hold the
//      phone number / push token; the FK is ON DELETE SET NULL so they would
//      otherwise survive).
//   3. The auth user. public.parents.id references auth.users ON DELETE
//      CASCADE, and children, check-ins (+ messages), appointments (upcoming
//      slots are released by the release_appointment_slot trigger),
//      conversations (+ messages), consultations, prescriptions (+ items),
//      documents, vaccinations, growth, health notes, allergies, conditions
//      and medications all cascade from parents / children.
//
// Doctors are refused: a doctor account is removed by the LilSteps team, not
// from the parent app.
//
// Request:  POST { "confirm": "DELETE" }  with Authorization: Bearer <user JWT>
// Response: { ok: true, consultsCancelled, lateNotRefunded, refundsStarted, refundsFailed,
//            notice? } or { error }. `notice` (plain words for the parent)
//            is set when a refund could not be started automatically.
//
// Deploy:
//   supabase functions deploy delete-account --project-ref <project-ref>

import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, getCaller } from '../_shared/supabase.ts';
import { deleteAccountData, REFUND_FAILED_NOTICE, settleConsultsBeforeDelete } from './account.ts';
import { endPlansForDeletedAccount } from '../_shared/carePlan.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient();
  const caller = await getCaller(req, admin);
  if (!caller) return jsonResponse({ error: 'Invalid session' }, 401);

  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    // fall through to the confirm check
  }
  if (body.confirm !== 'DELETE') {
    return jsonResponse({ error: 'Missing confirmation' }, 400);
  }

  const uid = caller.id;

  const { data: doctorAuth } = await admin
    .from('doctor_auth')
    .select('doctor_id')
    .eq('id', uid)
    .maybeSingle();
  if (doctorAuth) {
    return jsonResponse(
      { error: 'Doctor accounts are closed by the LilSteps team. Please contact support.' },
      403,
    );
  }

  try {
    // ── 0a. Care Plan: ended now at Razorpay, so a deleted account is
    //        never charged again. If Razorpay can't confirm, stop here (the
    //        parent tries again) rather than delete and keep billing.
    try {
      await endPlansForDeletedAccount(admin, uid);
    } catch (e) {
      console.error(`[delete-account] could not end Care Plan for ${uid}: ${(e as Error).message}`);
      return jsonResponse(
        { error: 'We could not cancel your Care Plan just now, so your account was not deleted. Please try again in a few minutes.' },
        502,
      );
    }
    // ── 0b. Upcoming consults: cancelled, refunded by the usual rules ────
    const settled = await settleConsultsBeforeDelete(admin, uid);
    const deleted = await deleteAccountData(admin, uid);

    console.log(
      `[delete-account] deleted user ${uid}: ${deleted.children} children, ${deleted.files} files, ` +
        `${settled.cancelled} consults cancelled, ${settled.refundsStarted} refunds started, ${settled.refundsFailed} refunds failed`,
    );
    return jsonResponse({
      ok: true,
      consultsCancelled: settled.cancelled,
      lateNotRefunded: settled.lateNotRefunded,
      refundsStarted: settled.refundsStarted,
      refundsFailed: settled.refundsFailed,
      ...(settled.refundsFailed > 0 ? { notice: REFUND_FAILED_NOTICE } : {}),
    });
  } catch (e) {
    // Details stay in the logs; the parent sees a plain message.
    console.error(`[delete-account] failed for ${uid}:`, e instanceof Error ? e.message : e);
    return jsonResponse(
      { error: 'We could not delete your account right now. Please try again.' },
      500,
    );
  }
});
