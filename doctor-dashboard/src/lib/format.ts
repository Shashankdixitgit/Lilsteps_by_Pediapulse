/**
 * Shared date / age / time formatting for the dashboard.
 *
 * Clinic time is IST. The server runs in UTC, so anything that means "today"
 * or prints a wall-clock time goes through Asia/Kolkata explicitly. Dates are
 * en-IN (13 Oct 2026), never US month-first.
 */

export const CLINIC_TZ = 'Asia/Kolkata';

/** YYYY-MM-DD for today in IST. */
export function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

/** YYYY-MM-DD for today + n days in IST. */
export function istDatePlus(days: number): string {
  const [y, m, d] = todayIst().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** A DB `date` (YYYY-MM-DD) as a calendar day. Parsed as UTC noon so no TZ can shift it. */
function dateOnly(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

/** "Tue, 13 Oct" */
export function formatDayShort(iso: string): string {
  return dateOnly(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "13 Oct 2026" */
export function formatDate(iso: string): string {
  return dateOnly(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Weekday / day / month parts for the editorial date stamps. */
export function dateStamp(iso: string): { weekday: string; day: string; month: string } {
  const d = dateOnly(iso);
  const opt = (o: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('en-IN', { ...o, timeZone: 'UTC' });
  return {
    weekday: opt({ weekday: 'short' }).toUpperCase(),
    day: opt({ day: '2-digit' }),
    month: opt({ month: 'short' }).toUpperCase(),
  };
}

/** "Tuesday, 13 October" for a timestamp, in IST. */
export function formatDayLong(ts: string): string {
  return new Date(ts).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: CLINIC_TZ,
  });
}

/** "13 Oct 2026, 2:05 pm" for a timestamp, in IST. */
export function formatDateTime(ts: string): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: CLINIC_TZ,
  });
}

/** "2:05 pm" for a timestamp, in IST. */
export function formatClock(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: CLINIC_TZ,
  });
}

/** A DB `time` ("14:00:00") as "2:00 pm". */
export function formatSlotTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Today" / "Tomorrow" / "Yesterday" for a DB date relative to IST today, else null. */
export function relativeDayLabel(iso: string): string | null {
  if (iso === todayIst()) return 'Today';
  if (iso === istDatePlus(1)) return 'Tomorrow';
  if (iso === istDatePlus(-1)) return 'Yesterday';
  return null;
}

/** Unambiguous "how long ago": "just now", "5 min ago", "3 hr ago", "2 days ago", else a date. */
export function timeAgo(ts: string): string {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: CLINIC_TZ,
  });
}

/** Child age from DOB: "Newborn", "5 mo", "3 yr", "3 yr 4 mo". */
export function computeAge(dob: string): string {
  const [by, bm, bd] = dob.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = todayIst().split('-').map(Number);
  let months = (ty - by) * 12 + (tm - bm);
  if (td < bd) months -= 1;
  if (months < 1) return 'Newborn';
  if (months < 24) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} yr` : `${years} yr ${rest} mo`;
}

/** "HH:MM:SS" wall-clock time now in IST, comparable with a DB `time`. */
export function nowIstTime(): string {
  return new Date().toLocaleTimeString('en-GB', { timeZone: CLINIC_TZ, hour12: false });
}
