// Edge Function: appointment-reminders
//
// Cron-triggered every 15 minutes (pg_cron job 'appointment-reminders',
// pg_net + the Vault secret 'lilsteps_server_key' on the apikey header).
// Sends two reminders per appointment:
//   • 24h before (template: appointment_reminder_24h)
//   • 1h before  (template: appointment_reminder_1h)
//
// Idempotent: checks notification_log for a 'sent' row with the same
// (appointment_id, template, payload.starts_at) and skips if already
// dispatched. Keyed on the start time so a rescheduled consult is reminded
// again for its new time.
//
// Also runs the refund-alert sweep (_shared/refundAlerts.ts) first: a
// payment that is refund_failed, or stuck owing a refund for 30+ minutes,
// is emailed to the team once.
//
// And, after the reminders, the Care Plan sync (_shared/carePlan.ts
// syncCarePlans): the Razorpay webhook has no subscription.* events, so up
// to 50 plans per run are fetched from Razorpay (longest-unchecked first,
// 45 s budget) and applied like a webhook would be: renewals, failed
// renewals, cancellations, revived subscriptions. Its own try/catch: it can
// never stop or fail the reminders.
//
// Rejects any caller without a server key.
//
// Deploy: `supabase functions deploy appointment-reminders --no-verify-jwt --project-ref ahikfefphptmtivwukpv`

import { alreadyNotified, notifyParent } from '../_shared/parentNotify.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, isServerCaller } from '../_shared/supabase.ts';
import { consultStart, startsAtKey } from '../_shared/schedule.ts';
import { sweepRefundAlerts } from '../_shared/refundAlerts.ts';
import { syncCarePlans } from '../_shared/carePlan.ts';

/** Care Plan sync (after the reminders, so a slow Razorpay never delays them). Never throws. */
async function carePlanSync(admin: ReturnType<typeof createAdminClient>) {
  try {
    return await syncCarePlans(admin);
  } catch (e) {
    console.error(`[appointment-reminders] care plan sync: ${(e as Error).message}`);
    return { error: 'sync failed' };
  }
}

interface AppointmentRow {
  id: string;
  date: string;
  time: string;
  parent_id: string;
  child_id: string;
  reschedule_count: number;
  doctors: { name: string } | null;
  children: { name: string } | null;
}

Deno.serve(async (req) => {
  // Cron-only: deployed with --no-verify-jwt, so gate on a server key here.
  // pg_net should send the secret key on the `apikey` header (from Vault).
  if (!isServerCaller(req)) return jsonResponse({ error: 'Unauthorized' }, 401);

  const admin = createAdminClient();

  // Refunds a person must look at (refundAlerts.ts): emails the team once per
  // payment. Rides on this 15-minute schedule; it never stops the reminders.
  let refundAlerts: Awaited<ReturnType<typeof sweepRefundAlerts>> | { error: string } = [];
  try {
    refundAlerts = await sweepRefundAlerts(admin);
  } catch (e) {
    console.error(`[appointment-reminders] refund alert sweep: ${(e as Error).message}`);
    refundAlerts = { error: 'sweep failed' };
  }

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + 26 * 3600 * 1000); // a bit > 24h

  const todayIso = now.toISOString().slice(0, 10);
  const horizonIso = horizonEnd.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from('appointments')
    .select(
      'id, date, time, parent_id, child_id, reschedule_count, doctors(name), children(name)',
    )
    .eq('status', 'upcoming')
    .gte('date', todayIso)
    .lte('date', horizonIso)
    .returns<AppointmentRow[]>();

  if (error) {
    console.error(`[appointment-reminders] query failed: ${error.message}`);
    const carePlans = await carePlanSync(admin);
    return jsonResponse({ error: 'Query failed', refundAlerts, carePlans }, 500);
  }

  const results: Array<{ id: string; template: string; ok: boolean; error?: string }> = [];

  for (const appt of data ?? []) {
    const slotAt = consultStart(appt.date, appt.time);
    const msUntil = slotAt.getTime() - now.getTime();
    if (msUntil <= 0) continue;

    const templates: string[] = [];
    if (msUntil <= 25 * 3600 * 1000 && msUntil > 60 * 60 * 1000) {
      templates.push('appointment_reminder_24h');
    }
    if (msUntil <= 75 * 60 * 1000 && msUntil > 0) {
      templates.push('appointment_reminder_1h');
    }
    if (templates.length === 0) continue;

    // Reminders are per consult time AND move (0051): a consult moved with
    // Reschedule gets them again, even if moved back to an earlier time.
    const startsAt = startsAtKey(appt.date, appt.time, appt.reschedule_count ?? 0);
    for (const template of templates) {
      // Idempotency: one of each reminder per consult time, on any channel
      // (the 0051 unique index also stops a second run racing this one);
      // failed or skipped sends stop after MAX_ATTEMPTS tries instead of
      // every run. Rows from before 0051 have no start time: they still count
      // for a consult that was never moved.
      if (await alreadyNotified(admin, appt.id, template, { key: startsAt, legacyCounts: !appt.reschedule_count })) {
        results.push({ id: appt.id, template, ok: true });
        continue;
      }

      const sent = await notifyParent(admin, {
        parentId: appt.parent_id,
        childId: appt.child_id,
        appointmentId: appt.id,
        template,
        params: {
          doctor: appt.doctors?.name ?? 'your doctor',
          child: appt.children?.name ?? '',
          date: appt.date,
          time: appt.time.slice(0, 5),
        },
        payload: { starts_at: startsAt },
      });
      for (const r of sent) results.push({ id: appt.id, template, ok: r.ok, error: r.error });
    }
  }

  const carePlans = await carePlanSync(admin);
  return jsonResponse({ ok: true, dispatched: results.length, results, refundAlerts, carePlans });
});
