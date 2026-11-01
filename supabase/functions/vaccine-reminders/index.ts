// Edge Function: vaccine-reminders
//
// Cron-triggered daily. For each vaccination scheduled within the next 7 days
// (and not yet administered), sends a one-time reminder SMS + push.
//
// NOT DEPLOYED yet: no SMS provider (Twilio/DLT) and no pg_cron schedule.
// Rejects any caller without a server key, so deploying it is safe.
//
// Deploy: `supabase functions deploy vaccine-reminders --no-verify-jwt --project-ref ahikfefphptmtivwukpv`

import { MAX_ATTEMPTS, notifyParent } from '../_shared/parentNotify.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, isServerCaller } from '../_shared/supabase.ts';

interface VaccinationRow {
  id: string;
  child_id: string;
  vaccine_name: string;
  scheduled_date: string;
  children: {
    name: string;
    parent_id: string;
  } | null;
}

Deno.serve(async (req) => {
  // Cron-only: deployed with --no-verify-jwt, so gate on a server key here.
  // pg_net should send the secret key on the `apikey` header (from Vault).
  if (!isServerCaller(req)) return jsonResponse({ error: 'Unauthorized' }, 401);

  const admin = createAdminClient();

  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  const { data, error } = await admin
    .from('vaccinations')
    .select(
      'id, child_id, vaccine_name, scheduled_date, children(name, parent_id)',
    )
    .in('status', ['due_soon', 'upcoming'])
    .gte('scheduled_date', today)
    .lte('scheduled_date', horizon)
    .returns<VaccinationRow[]>();

  if (error) {
    console.error(`[vaccine-reminders] query failed: ${error.message}`);
    return jsonResponse({ error: 'Query failed' }, 500);
  }

  const template = 'vaccine_due_soon';
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const v of data ?? []) {
    if (!v.children) continue;

    // Idempotency: one reminder per vaccination row; failed / skipped runs
    // stop retrying after MAX_ATTEMPTS (no new row every run).
    const { data: tries } = await admin
      .from('notification_log')
      .select('status')
      .eq('template', template)
      .eq('child_id', v.child_id)
      .eq('payload->>vaccinationId', v.id);
    if ((tries ?? []).some((t) => t.status === 'sent') || (tries ?? []).length >= MAX_ATTEMPTS) {
      results.push({ id: v.id, ok: true });
      continue;
    }

    const sent = await notifyParent(admin, {
      parentId: v.children.parent_id,
      childId: v.child_id,
      template,
      params: {
        vaccine: v.vaccine_name,
        child: v.children.name,
        date: v.scheduled_date,
      },
      payload: { vaccinationId: v.id },
    });
    for (const r of sent) results.push({ id: v.id, ok: r.ok, error: r.error });
  }

  return jsonResponse({ ok: true, dispatched: results.length, results });
});
