// Edge Function: appointment-reminders
//
// Cron-triggered. Sends two reminders per appointment:
//   • 24h before (template: appointment_reminder_24h)
//   • 1h before  (template: appointment_reminder_1h)
//
// Idempotent: checks notification_log for a 'sent' row with the same
// (appointment_id, template) and skips if already dispatched.
//
// Schedule (recommended): hourly via pg_cron — see migration notes.
//   select cron.schedule('appointment-reminders', '0 * * * *',
//     $$ select net.http_post(...); $$);
//
// Or, simpler: invoke via Supabase Scheduled Functions in the dashboard.
//
// Deploy: `supabase functions deploy appointment-reminders --no-verify-jwt --project-ref opdosbudlzwywdmrxlqr`

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { dispatch } from '../_shared/notify.ts';
import { jsonResponse } from '../_shared/cors.ts';

interface AppointmentRow {
  id: string;
  date: string;
  time: string;
  parent_id: string;
  child_id: string;
  doctors: { name: string } | null;
  parents: { phone: string | null; expo_push_token: string | null } | null;
}

function buildSlot(date: string, time: string): Date {
  // PostgreSQL DATE + TIME — treat as IST. Pedia Pulse is Pune-based.
  // IST = UTC+5:30, no DST.
  return new Date(`${date}T${time.slice(0, 8)}+05:30`);
}

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + 26 * 3600 * 1000); // a bit > 24h

  const todayIso = now.toISOString().slice(0, 10);
  const horizonIso = horizonEnd.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from('appointments')
    .select(
      'id, date, time, parent_id, child_id, doctors(name), parents(phone, expo_push_token)',
    )
    .eq('status', 'upcoming')
    .gte('date', todayIso)
    .lte('date', horizonIso)
    .returns<AppointmentRow[]>();

  if (error) return jsonResponse({ error: error.message }, 500);

  const results: Array<{ id: string; template: string; ok: boolean; error?: string }> = [];

  for (const appt of data ?? []) {
    const slotAt = buildSlot(appt.date, appt.time);
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

    for (const template of templates) {
      // Idempotency: skip if already sent
      const { count } = await admin
        .from('notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('appointment_id', appt.id)
        .eq('template', template)
        .eq('status', 'sent');
      if ((count ?? 0) > 0) {
        results.push({ id: appt.id, template, ok: true });
        continue;
      }

      const params = {
        doctor: appt.doctors?.name ?? 'your doctor',
        date: appt.date,
        time: appt.time.slice(0, 5),
      };

      // SMS first (cheap + works for non-app users), then push if token present.
      const channels: Array<'sms' | 'push'> = [];
      if (appt.parents?.phone) channels.push('sms');
      if (appt.parents?.expo_push_token) channels.push('push');

      for (const channel of channels) {
        const { data: queued } = await admin
          .from('notification_log')
          .insert({
            channel,
            template,
            recipient:
              channel === 'sms'
                ? appt.parents?.phone ?? ''
                : appt.parents?.expo_push_token ?? '',
            parent_id: appt.parent_id,
            child_id: appt.child_id,
            appointment_id: appt.id,
            status: 'queued',
            payload: { template, params },
          })
          .select('id')
          .single();

        const r = await dispatch({
          channel,
          template,
          params,
          recipient: {
            phone: appt.parents?.phone ?? undefined,
            expo_push_token: appt.parents?.expo_push_token ?? undefined,
          },
        });

        if (queued?.id) {
          await admin
            .from('notification_log')
            .update({
              status: r.ok ? 'sent' : 'failed',
              provider_id: r.providerId ?? null,
              error: r.error ?? null,
              sent_at: r.ok ? new Date().toISOString() : null,
            })
            .eq('id', queued.id);
        }
        results.push({ id: appt.id, template, ok: r.ok, error: r.error });
      }
    }
  }

  return jsonResponse({ ok: true, dispatched: results.length, results });
});
