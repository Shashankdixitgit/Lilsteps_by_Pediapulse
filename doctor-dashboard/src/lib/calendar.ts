/**
 * Calendar maths for the queue's schedule view. Everything works on DB
 * `date` strings (YYYY-MM-DD) and `time` strings (HH:MM:SS), which are
 * already clinic-local (IST) wall-clock values, so no time zone is involved.
 */

import type { Urgency } from './appointments';

/** Every booked visit is a 30-minute video consult. */
export const SLOT_MINUTES = 30;

export type CalendarView = 1 | 3 | 7;

export const VIEW_LABEL: Record<CalendarView, string> = {
  1: 'Day',
  3: '3 days',
  7: 'Week',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

function utcNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function isIsoDate(v: string | undefined): v is string {
  return !!v && ISO_DATE.test(v) && !Number.isNaN(utcNoon(v).getTime());
}

export function isIsoMonth(v: string | undefined): v is string {
  return !!v && ISO_MONTH.test(v) && Number(v.slice(5)) >= 1 && Number(v.slice(5)) <= 12;
}

export function parseView(v: string | undefined): CalendarView {
  return v === '1' ? 1 : v === '7' ? 7 : 3;
}

export function addDays(iso: string, n: number): string {
  const d = utcNoon(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week holding `iso`. */
export function startOfWeek(iso: string): string {
  const dow = (utcNoon(iso).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -dow);
}

/** The first day a view shows: the week's Monday for the week view, else the anchor. */
export function rangeStart(anchor: string, view: CalendarView): string {
  return view === 7 ? startOfWeek(anchor) : anchor;
}

export function daysFrom(start: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}

function fmt(iso: string, o: Intl.DateTimeFormatOptions): string {
  return utcNoon(iso).toLocaleDateString('en-IN', { ...o, timeZone: 'UTC' });
}

/** "Sun" */
export const weekdayShort = (iso: string) => fmt(iso, { weekday: 'short' });
/** "1" */
export const dayOfMonth = (iso: string) => String(Number(iso.slice(8, 10)));
/** "November 2026" */
export const monthTitle = (iso: string) => fmt(iso, { month: 'long', year: 'numeric' });
/** "Sunday, 1 November" */
export const dayTitle = (iso: string) => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });

/** Title for a range: "November 2026", or "Oct – Nov 2026" when it spans two months. */
export function rangeTitle(days: string[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (first.slice(0, 7) === last.slice(0, 7)) return monthTitle(first);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const a = fmt(first, sameYear ? { month: 'short' } : { month: 'short', year: 'numeric' });
  return `${a} – ${fmt(last, { month: 'short', year: 'numeric' })}`;
}

/** Six Monday-first weeks covering a YYYY-MM month (42 dates). */
export function monthGrid(month: string): string[] {
  return daysFrom(startOfWeek(`${month}-01`), 42);
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** "14:30:00" -> 870 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** 870 -> "2:30 pm" */
export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** 14 -> "2 PM" for the hour gutter. */
export function hourLabel(h: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}

/**
 * What colour an event gets. Closed visits are muted; open ones are coded by
 * the AI check-in's urgency, and visits booked without a check-in get their own.
 */
export type EventKind = 'urgent' | 'soon' | 'routine' | 'direct' | 'closed';

export function eventKind(status: string, urgency: Urgency | undefined, hasCheckin: boolean): EventKind {
  if (status !== 'upcoming') return 'closed';
  if (urgency === 'urgent') return 'urgent';
  if (urgency === 'soon') return 'soon';
  return hasCheckin ? 'routine' : 'direct';
}

export const KIND_LABEL: Record<EventKind, string> = {
  urgent: 'Urgent · see today',
  soon: 'See in 1–2 days',
  routine: 'AI check-in',
  direct: 'Booked directly',
  closed: 'Closed',
};

/** Pastel fill, left border and text colour per kind. */
export const KIND_STYLE: Record<EventKind, { bg: string; bar: string; text: string }> = {
  urgent: { bg: '#ffe6de', bar: '#e0533a', text: '#5c1a0e' },
  soon: { bg: '#fff0d6', bar: '#d98a1c', text: '#5a3604' },
  routine: { bg: '#ece8ff', bar: '#6052bc', text: '#2a1f63' },
  direct: { bg: '#e0f2ea', bar: '#1f8a6e', text: '#0d3d30' },
  closed: { bg: '#f1eee6', bar: '#b5b2bf', text: '#65687b' },
};

/**
 * Side-by-side lanes for events that overlap in time. Returns, per event in
 * input order, its lane and how many lanes its overlapping group uses.
 */
export function layoutLanes(events: { start: number; end: number }[]): { lane: number; lanes: number }[] {
  const order = events.map((e, i) => ({ ...e, i })).sort((a, b) => a.start - b.start || a.end - b.end);
  const out: { lane: number; lanes: number }[] = new Array(events.length);
  let group: typeof order = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    group.forEach((e) => (out[e.i].lanes = lanes));
    group = [];
    laneEnds = [];
  };
  for (const e of order) {
    if (group.length && e.start >= groupEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= e.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e.end);
    } else {
      laneEnds[lane] = e.end;
    }
    out[e.i] = { lane, lanes: 1 };
    group.push(e);
    groupEnd = Math.max(groupEnd, e.end);
  }
  flush();
  return out;
}
