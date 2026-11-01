// deno test --allow-env supabase/functions/vaccine-reminders/plan_test.ts
//
// Item 10: which doses get a reminder today, grouped one message per child
// per date, each dose at most once per window.
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  addDays,
  istToday,
  type LogRow,
  planReminders,
  queryRange,
  settledKeys,
  vaccineList,
  type VaccinationRow,
  windowFor,
} from './plan.ts';
import { renderEmail } from '../_shared/templates.ts';

const TODAY = '2026-11-10';

function dose(id: string, date: string, over: Partial<VaccinationRow> = {}): VaccinationRow {
  return {
    id,
    child_id: 'c1',
    vaccine_name: 'MMR',
    dose_label: 'Dose 1',
    scheduled_date: date,
    status: 'upcoming',
    children: { name: 'Myra', parent_id: 'u1' },
    ...over,
  };
}

Deno.test('istToday is the India date (09:00 IST run = 03:30 UTC same day; 23:00 UTC is tomorrow in IST)', () => {
  assertEquals(istToday(Date.parse('2026-11-10T03:30:00Z')), '2026-11-10');
  assertEquals(istToday(Date.parse('2026-11-10T19:00:00Z')), '2026-11-11');
  assertEquals(addDays('2026-11-28', 7), '2026-12-05');
  assertEquals(queryRange(TODAY), { from: '2026-10-11', to: '2026-11-17' });
});

Deno.test('windows: due in 0–7 days; overdue 7–30 days late; never done, not-sure or flu-overdue', () => {
  assertEquals(windowFor(TODAY, 'upcoming', 'MMR', TODAY), 'due');
  assertEquals(windowFor('2026-11-17', 'due_soon', 'MMR', TODAY), 'due');
  assertEquals(windowFor('2026-11-18', 'upcoming', 'MMR', TODAY), null);
  // Stored status is a snapshot: an 'upcoming' row whose date has passed is late.
  assertEquals(windowFor('2026-11-03', 'upcoming', 'MMR', TODAY), 'overdue');
  assertEquals(windowFor('2026-10-11', 'overdue', 'MMR', TODAY), 'overdue');
  assertEquals(windowFor('2026-11-04', 'overdue', 'MMR', TODAY), null); // under a week late: give them time
  assertEquals(windowFor('2026-10-10', 'overdue', 'MMR', TODAY), null); // over 30 days: the doctor's job
  assertEquals(windowFor('2026-11-12', 'done', 'MMR', TODAY), null);
  assertEquals(windowFor('2026-11-12', 'unknown', 'MMR', TODAY), null);
  assertEquals(windowFor('2026-11-03', 'upcoming', 'Influenza', TODAY), null);
  assertEquals(windowFor('2026-11-12', 'upcoming', 'Influenza', TODAY), 'due');
});

Deno.test('plan: one message per child per date, listing every dose; other children apart', () => {
  const rows = [
    dose('v1', '2026-11-12', { vaccine_name: 'DTwP/DTaP', dose_label: 'Dose 1' }),
    dose('v2', '2026-11-12', { vaccine_name: 'IPV', dose_label: 'Dose 1' }),
    dose('v3', '2026-11-12', { vaccine_name: 'Hib', dose_label: 'Dose 1' }),
    dose('v4', '2026-11-12', { child_id: 'c2', children: { name: 'Aarav', parent_id: 'u1' } }),
    dose('v5', '2026-11-01', { status: 'overdue' }),
    dose('v6', '2026-11-12', { status: 'done' }),
    dose('v7', '2026-11-12', { children: null }),
  ];
  const groups = planReminders(rows, new Set(), TODAY);
  assertEquals(
    groups.map((g) => [g.template, g.childId, g.date, g.count, g.vaccines, g.keys.join(' ')]),
    [
      ['vaccine_overdue', 'c1', '2026-11-01', 1, 'MMR (Dose 1)', 'v5@2026-11-01'],
      ['vaccine_due_soon', 'c1', '2026-11-12', 3, 'DTwP/DTaP (Dose 1), IPV (Dose 1) and Hib (Dose 1)', 'v1@2026-11-12 v2@2026-11-12 v3@2026-11-12'],
      ['vaccine_due_soon', 'c2', '2026-11-12', 1, 'MMR (Dose 1)', 'v4@2026-11-12'],
    ],
  );
});

const log = (template: string, status: string, keys: string[], created_at = '2026-11-09T03:30:00Z'): LogRow => ({
  template,
  status,
  created_at,
  payload: { vaccineKeys: keys },
});

Deno.test('idempotency: a sent dose is not reminded again in that window, but is in the next', () => {
  const rows = [dose('v1', '2026-11-03'), dose('v2', '2026-11-12')];
  const settled = settledKeys(
    [log('vaccine_due_soon', 'sent', ['v1@2026-11-03']), log('vaccine_due_soon', 'sent', ['v2@2026-11-12'])],
    3,
  );
  // v1 was reminded while due; now it is late, so it gets the one overdue nudge.
  assertEquals(planReminders(rows, settled, TODAY).map((g) => g.keys), [['v1@2026-11-03']]);
  const after = settledKeys([log('vaccine_overdue', 'sent', ['v1@2026-11-03'])], 3);
  assertEquals(planReminders([dose('v1', '2026-11-03')], after, TODAY), []);
});

Deno.test('idempotency: a dose moved to a new date (DOB change) is reminded for the new date', () => {
  const settled = settledKeys([log('vaccine_due_soon', 'sent', ['v1@2026-11-11'])], 3);
  assertEquals(planReminders([dose('v1', '2026-11-14')], settled, TODAY).length, 1);
});

Deno.test('retries: failed / skipped tries stop after 3 different days; a sent push counts as sent', () => {
  const days = ['2026-11-07', '2026-11-08', '2026-11-09'].map((d) => `${d}T03:30:00Z`);
  const twoDays = settledKeys(days.slice(0, 2).flatMap((d) => [log('vaccine_due_soon', 'failed', ['v1@2026-11-12'], d), log('vaccine_due_soon', 'skipped', ['v1@2026-11-12'], d)]), 3);
  assertEquals(planReminders([dose('v1', '2026-11-12')], twoDays, TODAY).length, 1); // 4 rows, 2 days: try again
  const threeDays = settledKeys(days.map((d) => log('vaccine_due_soon', 'failed', ['v1@2026-11-12'], d)), 3);
  assertEquals(planReminders([dose('v1', '2026-11-12')], threeDays, TODAY), []);
  const push = settledKeys([log('vaccine_due_soon', 'failed', ['v1@2026-11-12']), log('vaccine_due_soon', 'sent', ['v1@2026-11-12'])], 3);
  assertEquals(planReminders([dose('v1', '2026-11-12')], push, TODAY), []);
});

Deno.test('idempotency: a run in flight (queued < 10 min) blocks; a stale queued row does not', () => {
  const now = Date.parse('2026-11-10T03:35:00Z');
  const fresh = settledKeys([log('vaccine_due_soon', 'queued', ['v1@2026-11-12'], '2026-11-10T03:30:00Z')], 3, now);
  assertEquals(planReminders([dose('v1', '2026-11-12')], fresh, TODAY), []);
  const stale = settledKeys([log('vaccine_due_soon', 'queued', ['v1@2026-11-12'], '2026-11-09T03:30:00Z')], 3, now);
  assertEquals(planReminders([dose('v1', '2026-11-12')], stale, TODAY).length, 1);
});

Deno.test('legacy rows (payload.vaccinationId) count for the due window', () => {
  const settled = settledKeys([{ template: 'vaccine_due_soon', status: 'sent', created_at: '2026-11-09T03:30:00Z', payload: { vaccinationId: 'v1' } }], 3);
  assertEquals(planReminders([dose('v1', '2026-11-12')], settled, TODAY), []);
});

Deno.test('vaccineList stays under the 120-character template limit', () => {
  const labels = ['DTwP/DTaP (Dose 1)', 'IPV (Dose 1)', 'Hib (Dose 1)', 'Hepatitis B (Dose 2)', 'Rotavirus (Dose 1)', 'PCV (Dose 1)', 'Typhoid Conjugate (Dose 1)'];
  const text = vaccineList(labels);
  assert(text.length <= 110, text);
  assertStringIncludes(text, 'more');
  assertEquals(vaccineList(['MMR (Dose 1)']), 'MMR (Dose 1)');
  assertEquals(vaccineList(['A', 'B']), 'A and B');
});

Deno.test('emails: due soon / overdue wording, singular and plural, no booking promise', () => {
  const one = renderEmail('vaccine_due_soon', { parent: 'Priya', child: 'Myra', vaccine: 'MMR (Dose 1)', count: '1', date: '2026-11-12' });
  assertEquals(one.subject, 'A vaccine is due soon');
  assertStringIncludes(one.text, 'MMR (Dose 1) is due for Myra.');
  assertStringIncludes(one.text, 'Due Thursday, 12 November');
  assertStringIncludes(one.text, 'mark it as given');
  assert(!/book a slot/i.test(one.text));
  const many = renderEmail('vaccine_due_soon', { child: 'Myra', vaccine: 'IPV (Dose 1) and Hib (Dose 1)', count: '2', date: '2026-11-12' });
  assertEquals(many.subject, 'Vaccines due soon');
  assertStringIncludes(many.text, 'are due for Myra');
  const late = renderEmail('vaccine_overdue', { child: 'Myra', vaccine: 'MMR (Dose 1)', count: '1', date: '2026-11-01' });
  assertEquals(late.subject, 'A vaccine is not marked as given');
  assertStringIncludes(late.text, 'Was due Sunday, 1 November');
  assertStringIncludes(late.text, 'paediatrician');
  // Subjects stay generic: no child or vaccine name in the inbox preview.
  for (const e of [one, many, late]) assert(!e.subject.includes('Myra') && !e.subject.includes('MMR'));
});
