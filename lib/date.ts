/**
 * Date-only helpers. Everything here works on LOCAL calendar dates, never on
 * UTC timestamps, so a date of birth or a due date never shifts by a day
 * because of the device time zone (IST is +5:30).
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Local midnight of the given date (drops the time of day). */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Parses a DB date ('YYYY-MM-DD', or an ISO timestamp) into a local Date.
 * A bare 'YYYY-MM-DD' becomes local midnight of that day, NOT UTC midnight
 * (which `new Date('2014-10-13')` gives and which can show as the 12th).
 * Full timestamps keep their instant.
 */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (value.length === 10) {
    const m = DATE_ONLY_RE.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(value);
}

/** 'YYYY-MM-DD' from the LOCAL calendar date. Use this for DB `date` columns
 *  instead of `toISOString().split('T')[0]`, which uses UTC. */
export function toDateOnlyString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today's local date as 'YYYY-MM-DD'. */
export function todayDateOnly(): string {
  return toDateOnlyString(new Date());
}

/**
 * Adds calendar years / months / weeks / days to a date, the way Postgres
 * `date + interval` does: a month step that lands past the end of the month
 * clamps to its last day (31 Jan + 1 month = 28/29 Feb, 29 Feb + 1 year =
 * 28 Feb). Keeps the result in step with iap_vaccine_schedule().
 */
export function addCalendar(
  date: Date,
  { years = 0, months = 0, weeks = 0, days = 0 }: { years?: number; months?: number; weeks?: number; days?: number },
): Date {
  const totalMonths = date.getMonth() + years * 12 + months;
  const y = date.getFullYear() + Math.floor(totalMonths / 12);
  const m = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const result = new Date(y, m, Math.min(date.getDate(), lastDay));
  result.setDate(result.getDate() + weeks * 7 + days);
  return result;
}

/** True when both dates fall on the same local calendar day. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * The app's one display format for dates (en-IN): "13 Oct" this year,
 * "13 Oct 2014" any other year. Pass `{ year: 'always' }` for records that
 * should always show the year (date of birth, documents).
 * Accepts a Date or a DB string ('YYYY-MM-DD' is read as a local date).
 */
export function formatDate(
  value: string | Date | null | undefined,
  { year = 'auto', now = new Date() }: { year?: 'auto' | 'always'; now?: Date } = {},
): string {
  if (value == null || value === '') return '';
  const date = parseDateOnly(value);
  if (Number.isNaN(date.getTime())) return '';
  const showYear = year === 'always' || date.getFullYear() !== now.getFullYear();
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(showYear ? { year: 'numeric' } : {}),
  });
}
