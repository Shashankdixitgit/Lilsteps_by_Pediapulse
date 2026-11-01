// Edge Function: vaccine-reminders
//
// Cron-triggered once a day (09:00 IST, see the PR for the pg_cron SQL).
// Emails (and pushes, where the parent has a push token) a reminder for:
//   • doses due in the next 7 days            → 'vaccine_due_soon'
//   • doses 7–30 days late, not marked given  → 'vaccine_overdue' (once)
// One message per child per due date, listing every dose due that day; each
// dose is reminded at most once per window (plan.ts has the rules).
//
// Who is never emailed: parents with no sign-in email (phone-only logins),
// our test / demo addresses (@lilsteps.dev, @demo.lilsteps.dev) and domains
// that can't take mail — parentNotify.ts decides. SMS stays off until
// SMS_ENABLED=true (DLT).
//
// Failed or skipped sends are retried on later days, up to MAX_ATTEMPTS days.
// Rejects any caller without a server key, so it is safe to deploy.
//
// Deploy: `supabase functions deploy vaccine-reminders --no-verify-jwt --project-ref ahikfefphptmtivwukpv`

import { MAX_ATTEMPTS, notifyParent } from '../_shared/parentNotify.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, isServerCaller } from '../_shared/supabase.ts';
import {
  istToday,
  type LogRow,
  planReminders,
  queryRange,
  settledKeys,
  TEMPLATE_FOR,
  type VaccinationRow,
} from './plan.ts';

const PAGE = 1000;
const CHUNK = 100;
/**
 * Stop starting new sends after this long (Edge Functions have a wall-clock
 * limit, and an email can take seconds). The rest go out on the next run:
 * a 'due' reminder is still 6+ days early then.
 */
const TIME_BUDGET_MS = 100_000;

Deno.serve(async (req) => {
  // Cron-only: deployed with --no-verify-jwt, so gate on a server key here.
  // pg_net sends the secret key on the `apikey` header (from Vault).
  if (!isServerCaller(req)) return jsonResponse({ error: 'Unauthorized' }, 401);

  const startedAt = Date.now();
  const admin = createAdminClient();
  const today = istToday();
  const { from, to } = queryRange(today);

  // Every dose in any window today, not given and not "Not sure".
  const rows: VaccinationRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('vaccinations')
      .select('id, child_id, vaccine_name, dose_label, scheduled_date, status, children(name, parent_id)')
      .not('status', 'in', '(done,unknown)')
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
      .returns<VaccinationRow[]>();
    if (error) {
      console.error(`[vaccine-reminders] query failed: ${error.message}`);
      return jsonResponse({ error: 'Query failed' }, 500);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  // What was already sent / tried for these children.
  const childIds = [...new Set(rows.map((r) => r.child_id))];
  const logs: LogRow[] = [];
  for (let i = 0; i < childIds.length; i += CHUNK) {
    const { data, error } = await admin
      .from('notification_log')
      .select('template, status, created_at, payload')
      .in('template', Object.values(TEMPLATE_FOR))
      .in('child_id', childIds.slice(i, i + CHUNK));
    if (error) {
      console.error(`[vaccine-reminders] log query failed: ${error.message}`);
      return jsonResponse({ error: 'Query failed' }, 500);
    }
    logs.push(...((data ?? []) as LogRow[]));
  }

  const groups = planReminders(rows, settledKeys(logs, MAX_ATTEMPTS), today);
  const results: Array<{ child: string; template: string; doses: number; channel?: string; ok: boolean; error?: string }> =
    [];

  let deferred = 0;
  for (const g of groups) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      deferred++;
      continue;
    }
    try {
      const sent = await notifyParent(admin, {
        parentId: g.parentId,
        childId: g.childId,
        template: g.template,
        params: {
          vaccine: g.vaccines,
          count: String(g.count),
          child: g.child,
          date: g.date,
        },
        payload: { vaccineKeys: g.keys, window: g.window },
      });
      // No email and no push token: nothing is sent and nothing logged.
      for (const r of sent) {
        results.push({ child: g.childId, template: g.template, doses: g.keys.length, channel: r.channel, ok: r.ok, error: r.error });
      }
    } catch (e) {
      console.error(`[vaccine-reminders] ${g.template} for child ${g.childId}: ${(e as Error).message}`);
      results.push({ child: g.childId, template: g.template, doses: g.keys.length, ok: false, error: 'send failed' });
    }
  }

  if (deferred) console.warn(`[vaccine-reminders] ${deferred} reminders left for the next run (time budget)`);
  return jsonResponse({ ok: true, today, candidates: rows.length, groups: groups.length, deferred, results });
});
