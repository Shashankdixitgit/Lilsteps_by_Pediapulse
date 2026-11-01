// Edge Function: appointment-reminders
//
// Cron-triggered. Sends two reminders per appointment:
//   • 24h before (template: appointment_reminder_24h)
//   • 1h before  (template: appointment_reminder_1h)
//
// Idempotent: checks notification_log for a 'sent' row with the same
// (appointment_id, template, payload.starts_at) and skips if already
// dispatched. Keyed on the start time so a rescheduled consult is reminded
// again for its new time.
//
// Schedule (recommended): hourly via pg_cron — see migration notes.
//   select cron.schedule('appointment-reminders', '0 * * * *',
//     $$ select net.http_post(...); $$);
//
// Or, simpler: invoke via Supabase Scheduled Functions in the dashboard.
//
// NOT DEPLOYED yet: no SMS provider (Twilio/DLT) and no pg_cron schedule.
// Rejects any caller without a server key, so deploying it is safe.
//
// Deploy: `supabase functions deploy appointment-reminders --no-verify-jwt --project-ref ahikfefphptmtivwukpv`

import { alreadyNotified, notifyParent } from '../_shared/parentNotify.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, isServerCaller } from '../_shared/supabase.ts';
import { consultStart, startsAtKey } from '../_shared/schedule.ts';

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
    return jsonResponse({ error: 'Query failed' }, 500);
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

  return jsonResponse({ ok: true, dispatched: results.length, results });
});
