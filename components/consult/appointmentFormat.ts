/**
 * One place for how appointments read to parents. Every booking screen
 * (check-in summary, Book a doctor, Home, Consult tab, video) uses these so
 * times, days and doctor initials look the same everywhere.
 *
 * Clinic time is IST (no DST), and time_slots store IST wall-clock times, so
 * everything here is computed in Asia/Kolkata regardless of device zone.
 */
import { formatDate } from '@/lib/date';

export const CLINIC_TZ = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';

/** Consult length shown to parents and used for the join window. */
export const CONSULT_MINUTES = 30;
/**
 * Join opens this many minutes before the start time. Must match the window
 * in get_my_appointment_meet_link (the DB releases the link 15 min before).
 */
export const JOIN_OPENS_MINUTES = 15;

/** "14:00:00" / "14:00" → "2:00 PM". */
export function formatSlotTime(t: string | null | undefined): string {
  if (!t) return '';
  const [hRaw, mRaw] = t.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  if (Number.isNaN(h) || Number.isNaN(m)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Today's clinic (IST) date as 'YYYY-MM-DD'. */
export function clinicToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

/** The instant an appointment starts ('YYYY-MM-DD' + 'HH:MM[:SS]' in IST). */
export function appointmentStart(date: string, time: string): Date {
  const hhmmss = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return new Date(`${date}T${hhmmss}${IST_OFFSET}`);
}

/** True once the consult has finished (start + CONSULT_MINUTES). */
export function appointmentEnded(date: string, time: string, now: Date = new Date()): boolean {
  return now.getTime() >= appointmentStart(date, time).getTime() + CONSULT_MINUTES * 60_000;
}

/**
 * Join is open from JOIN_OPENS_MINUTES before the start until an hour after
 * it (consults can run late).
 */
export function canJoinVideo(date: string, time: string, now: Date = new Date()): boolean {
  const start = appointmentStart(date, time).getTime();
  const t = now.getTime();
  return t >= start - JOIN_OPENS_MINUTES * 60_000 && t <= start + 60 * 60_000;
}

/** Adds n days to a 'YYYY-MM-DD' string (calendar arithmetic, no zones). */
function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** 'today' / 'tomorrow' / null for an ISO date, judged on the clinic calendar. */
export function relativeDay(iso: string, now: Date = new Date()): 'today' | 'tomorrow' | null {
  const today = clinicToday(now);
  if (iso === today) return 'today';
  if (iso === addDaysIso(today, 1)) return 'tomorrow';
  return null;
}

/** Short weekday for an ISO date ("Wed"). */
function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
}

/**
 * The day as a phrase that fits after "See you" / "will see … ":
 * "today, 13 Oct" · "tomorrow, 14 Oct" · "on Wed, 15 Oct".
 */
export function dayPhrase(iso: string, now: Date = new Date()): string {
  const rel = relativeDay(iso, now);
  const date = formatDate(iso, { now });
  return rel ? `${rel}, ${date}` : `on ${weekday(iso)}, ${date}`;
}

/** "today, 13 Oct at 2:00 PM" / "on Wed, 15 Oct at 2:00 PM". */
export function whenPhrase(iso: string, time: string, now: Date = new Date()): string {
  return `${dayPhrase(iso, now)} at ${formatSlotTime(time)}`;
}

/** Card / label form: "Today, 13 Oct · 2:00 PM". */
export function whenLabel(iso: string, time: string, now: Date = new Date()): string {
  const rel = relativeDay(iso, now);
  const day = rel ? rel.charAt(0).toUpperCase() + rel.slice(1) : weekday(iso);
  return `${day}, ${formatDate(iso, { now })} · ${formatSlotTime(time)}`;
}

/** Next n clinic days for a date picker (n = 7 everywhere). */
export interface BookingDay {
  /** 'Today' / 'Tomorrow' / 'Wed' */
  label: string;
  /** '13 Oct' */
  sub: string;
  isoDate: string;
  /** 'Today, 13 Oct' */
  fullLabel: string;
}

export const BOOKING_DAYS = 7;

export function getBookingDays(n: number = BOOKING_DAYS, now: Date = new Date()): BookingDay[] {
  const today = clinicToday(now);
  return Array.from({ length: n }, (_, i) => {
    const iso = addDaysIso(today, i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : weekday(iso);
    const sub = formatDate(iso, { now });
    return { label, sub, isoDate: iso, fullLabel: `${label}, ${sub}` };
  });
}

/** Last-name initial ("Dr. Emily Chen" → "C"), never the "D" of "Dr.". */
export function doctorInitial(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'D';
  const last = trimmed.split(/\s+/).slice(-1)[0] ?? trimmed;
  return Array.from(last)[0]?.toUpperCase() ?? 'D';
}

/** "Dr. Emily Chen" → "Dr. Chen"; a name without a title stays as given. */
export function doctorShortName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'doctor';
  const parts = trimmed.split(/\s+/);
  if (/^dr\.?$/i.test(parts[0]) && parts.length > 2) return `Dr. ${parts[parts.length - 1]}`;
  return trimmed;
}
