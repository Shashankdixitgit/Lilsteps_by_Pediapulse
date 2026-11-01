// Pure planning for vaccine reminders: which doses get an email today, grouped
// so a family gets ONE email per child per due date (a 6-week visit is often
// five vaccines on one day), while each dose is still reminded at most once
// per window.
//
// Windows (IST calendar dates):
//   'due'      scheduled in the next 7 days (today included)
//              → template vaccine_due_soon
//   'overdue'  7 to 30 days past its date and still not marked given
//              → template vaccine_overdue (one nudge; older gaps are for the
//              doctor to talk about, not for an email). Never for the yearly
//              flu shot, which is never "overdue" (0040).
//
// Stored vaccinations.status is a snapshot from insert time (0024), so the
// window comes from scheduled_date; only 'done' and 'unknown' ("Not sure")
// are read as stored, and both are skipped.
//
// Idempotency: each notification_log row carries payload.vaccineKeys
// ("<vaccination id>@<scheduled date>"). A dose whose key was sent (or is
// being sent) in that template is done; one tried on MAX_ATTEMPTS different
// days is given up. Keyed on the date as well, so a dose moved by a DOB
// change (0023) is reminded for its new date.

export const DUE_AHEAD_DAYS = 7;
export const OVERDUE_AFTER_DAYS = 7;
export const OVERDUE_UNTIL_DAYS = 30;
/** Same list as ANNUAL_VACCINE_NAMES in the app (constants/vaccineQuestions.ts). */
export const ANNUAL_VACCINES = new Set(['Influenza']);

export type ReminderWindow = 'due' | 'overdue';
export const TEMPLATE_FOR: Record<ReminderWindow, string> = { due: 'vaccine_due_soon', overdue: 'vaccine_overdue' };

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** Today's date in India ("2026-11-03"). */
export function istToday(now = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The earliest and latest scheduled_date any window can include today. */
export function queryRange(today: string): { from: string; to: string } {
  return { from: addDays(today, -OVERDUE_UNTIL_DAYS), to: addDays(today, DUE_AHEAD_DAYS) };
}

export function windowFor(
  scheduledDate: string,
  status: string,
  vaccineName: string,
  today: string,
): ReminderWindow | null {
  if (status === 'done' || status === 'unknown') return null;
  if (scheduledDate >= today && scheduledDate <= addDays(today, DUE_AHEAD_DAYS)) return 'due';
  if (ANNUAL_VACCINES.has(vaccineName)) return null;
  if (scheduledDate <= addDays(today, -OVERDUE_AFTER_DAYS) && scheduledDate >= addDays(today, -OVERDUE_UNTIL_DAYS)) {
    return 'overdue';
  }
  return null;
}

export function reminderKey(v: { id: string; scheduled_date: string }): string {
  return `${v.id}@${v.scheduled_date}`;
}

export interface VaccinationRow {
  id: string;
  child_id: string;
  vaccine_name: string;
  dose_label: string | null;
  scheduled_date: string;
  status: string;
  children: { name: string; parent_id: string } | null;
}

export interface LogRow {
  template: string;
  status: string;
  created_at: string;
  payload: { vaccineKeys?: unknown; vaccinationId?: unknown } | null;
}

export interface ReminderGroup {
  window: ReminderWindow;
  template: string;
  childId: string;
  parentId: string;
  child: string;
  date: string;
  keys: string[];
  /** "DTwP/DTaP (Dose 1), IPV (Dose 1) and 2 more" */
  vaccines: string;
  count: number;
}

const FRESH_QUEUED_MS = 10 * 60_000;

/** Per template, per key: settled (sent / in flight / out of tries) or not. */
export function settledKeys(logs: LogRow[], maxAttempts: number, now = Date.now()): Set<string> {
  const done = new Set<string>();
  const tryDays = new Map<string, Set<string>>();
  for (const l of logs) {
    const keys: string[] = Array.isArray(l.payload?.vaccineKeys)
      ? (l.payload!.vaccineKeys as unknown[]).filter((k): k is string => typeof k === 'string')
      : [];
    // Rows from before vaccineKeys (one row per dose, any date) count for the
    // 'due' window of that dose.
    const legacy = typeof l.payload?.vaccinationId === 'string' ? `${l.payload.vaccinationId}@*` : null;
    const all = legacy ? [...keys, legacy] : keys;
    const inFlight = l.status === 'queued' && Date.parse(l.created_at) >= now - FRESH_QUEUED_MS;
    for (const k of all) {
      const id = `${l.template}|${k}`;
      if (l.status === 'sent' || inFlight) done.add(id);
      const days = tryDays.get(id) ?? new Set<string>();
      days.add(istToday(Date.parse(l.created_at)));
      tryDays.set(id, days);
    }
  }
  for (const [id, days] of tryDays) if (days.size >= maxAttempts) done.add(id);
  return done;
}

function isSettled(settled: Set<string>, template: string, v: { id: string; scheduled_date: string }): boolean {
  return (
    settled.has(`${template}|${reminderKey(v)}`) ||
    (template === TEMPLATE_FOR.due && settled.has(`${template}|${v.id}@*`))
  );
}

function doseLabel(v: VaccinationRow): string {
  const dose = (v.dose_label ?? '').trim();
  return dose ? `${v.vaccine_name} (${dose})` : v.vaccine_name;
}

/** A readable list that stays under the template's 120-character limit. */
export function vaccineList(labels: string[], max = 110): string {
  for (let shown = labels.length; shown >= 1; shown--) {
    const head = labels.slice(0, shown);
    const rest = labels.length - shown;
    const text =
      rest > 0
        ? `${head.join(', ')} and ${rest} more`
        : head.length > 1
          ? `${head.slice(0, -1).join(', ')} and ${head[head.length - 1]}`
          : head[0];
    if (text.length <= max) return text;
  }
  return `${labels.length} vaccines`;
}

export function planReminders(rows: VaccinationRow[], settled: Set<string>, today: string): ReminderGroup[] {
  const groups = new Map<string, ReminderGroup & { labels: string[] }>();
  for (const v of rows) {
    if (!v.children?.parent_id) continue;
    const window = windowFor(v.scheduled_date, v.status, v.vaccine_name, today);
    if (!window) continue;
    const template = TEMPLATE_FOR[window];
    if (isSettled(settled, template, v)) continue;
    const gk = `${template}|${v.child_id}|${v.scheduled_date}`;
    const g = groups.get(gk) ?? {
      window,
      template,
      childId: v.child_id,
      parentId: v.children.parent_id,
      child: v.children.name,
      date: v.scheduled_date,
      keys: [],
      labels: [],
      vaccines: '',
      count: 0,
    };
    g.keys.push(reminderKey(v));
    g.labels.push(doseLabel(v));
    groups.set(gk, g);
  }
  return [...groups.values()]
    .map(({ labels, ...g }) => ({ ...g, vaccines: vaccineList(labels), count: labels.length }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.childId.localeCompare(b.childId));
}
