// Edge Function: vaccine-reminders
//
// Cron-triggered daily. For each vaccination scheduled within the next 7 days
// (and not yet administered), sends a one-time reminder SMS + push.
//
// Deploy: `supabase functions deploy vaccine-reminders --no-verify-jwt --project-ref opdosbudlzwywdmrxlqr`

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { dispatch } from '../_shared/notify.ts';
import { jsonResponse } from '../_shared/cors.ts';

interface VaccinationRow {
  id: string;
  child_id: string;
  vaccine_name: string;
  scheduled_date: string;
  children: {
    name: string;
    parent_id: string;
    parents: { phone: string | null; expo_push_token: string | null } | null;
  } | null;
}

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  const { data, error } = await admin
    .from('vaccinations')
    .select(
      'id, child_id, vaccine_name, scheduled_date, children(name, parent_id, parents(phone, expo_push_token))',
    )
    .in('status', ['due_soon', 'upcoming'])
    .gte('scheduled_date', today)
    .lte('scheduled_date', horizon)
    .returns<VaccinationRow[]>();

  if (error) return jsonResponse({ error: error.message }, 500);

  const template = 'vaccine_due_soon';
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const v of data ?? []) {
    if (!v.children?.parents) continue;

    // Idempotency: one reminder per vaccination row.
    const { count } = await admin
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('template', template)
      .eq('child_id', v.child_id)
      .eq('payload->>vaccinationId', v.id)
      .eq('status', 'sent');
    if ((count ?? 0) > 0) {
      results.push({ id: v.id, ok: true });
      continue;
    }

    const params = {
      vaccine: v.vaccine_name,
      child: v.children.name,
      date: v.scheduled_date,
    };

    const channels: Array<'sms' | 'push'> = [];
    if (v.children.parents.phone) channels.push('sms');
    if (v.children.parents.expo_push_token) channels.push('push');

    for (const channel of channels) {
      const { data: queued } = await admin
        .from('notification_log')
        .insert({
          channel,
          template,
          recipient:
            channel === 'sms'
              ? v.children.parents.phone ?? ''
              : v.children.parents.expo_push_token ?? '',
          parent_id: v.children.parent_id,
          child_id: v.child_id,
          status: 'queued',
          payload: { template, params, vaccinationId: v.id },
        })
        .select('id')
        .single();

      const r = await dispatch({
        channel,
        template,
        params,
        recipient: {
          phone: v.children.parents.phone ?? undefined,
          expo_push_token: v.children.parents.expo_push_token ?? undefined,
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
      results.push({ id: v.id, ok: r.ok, error: r.error });
    }
  }

  return jsonResponse({ ok: true, dispatched: results.length, results });
});
