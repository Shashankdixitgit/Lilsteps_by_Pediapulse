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
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      // new Date(y, …) reads years 0-99 as 1900-1999: "0002-05-01" (a year
      // half-typed in a date input) must not become 1902.
      d.setFullYear(Number(m[1]));
      return d;
    }
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
  // Built by hand, not toLocaleDateString: Android's ICU writes "10 Sept"
  // and iOS "10 Sep" for en-IN (review should-fix 14).
  const dm = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  return showYear ? `${dm} ${date.getFullYear()}` : dm;
}

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Wed" for a Date's local weekday. */
export function weekdayShort(date: Date): string {
  return WEEKDAYS_SHORT[date.getDay()];
}

/**
 * The app's one time format: "4:55 PM" on every phone (Android's ICU wrote
 * "4:55 pm", iOS "4:55 PM"; review should-fix 14). Local time of a Date or
 * an ISO timestamp.
 */
export function formatClockTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
