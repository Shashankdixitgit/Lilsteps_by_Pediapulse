import Link from 'next/link';
import type { Urgency } from '@/lib/appointments';
import {
  KIND_LABEL,
  KIND_STYLE,
  SLOT_MINUTES,
  VIEW_LABEL,
  addDays,
  dayOfMonth,
  dayTitle,
  hourLabel,
  layoutLanes,
  minutesToLabel,
  monthGrid,
  monthTitle,
  rangeTitle,
  shiftMonth,
  weekdayShort,
  type CalendarView,
  type EventKind,
} from '@/lib/calendar';
import { UrgencyBadge } from '../urgency-badge';
import { GridScroller } from './grid-scroller';
import { NowLine } from './now-line';

export type CalEvent = {
  id: string;
  date: string;
  /** Minutes after midnight (IST wall clock). */
  start: number;
  childName: string;
  parentName: string | null;
  concern: string | null;
  kind: EventKind;
  status: string;
  /** Today's open visit whose slot has started. */
  late: boolean;
  /** An open visit on a past day: still to be closed. */
  needsClosing: boolean;
};

export type NextUp = {
  event: CalEvent;
  urgency: Urgency | undefined;
  when: string;
  meetLink: string | null;
};

type Nav = { anchor: string; view: CalendarView; month: string };

const HOUR_PX = 72;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const ORDERED_KINDS: EventKind[] = ['urgent', 'soon', 'routine', 'direct', 'closed'];

/** Queue URL for a calendar position; defaults are left out to keep links short. */
export function scheduleHref({ anchor, view, month }: Nav, today: string): string {
  const q = new URLSearchParams();
  if (anchor !== today) q.set('d', anchor);
  if (view !== 3) q.set('v', String(view));
  if (month !== anchor.slice(0, 7)) q.set('m', month);
  const s = q.toString();
  return s ? `/?${s}` : '/';
}

export function Schedule({
  today,
  nowMinutes,
  days,
  nav,
  events,
  bookedDays,
  nextUp,
  later,
  stats,
}: {
  today: string;
  nowMinutes: number;
  days: string[];
  nav: Nav;
  events: CalEvent[];
  /** Days in the mini-calendar month with an open booking. */
  bookedDays: Set<string>;
  nextUp: NextUp | null;
  later: { event: CalEvent; when: string }[];
  stats: { today: number; ready: number; upcoming: number };
}) {
  const step = nav.view;
  const href = (p: Partial<Nav>) => scheduleHref({ ...nav, ...p, month: p.month ?? (p.anchor ?? nav.anchor).slice(0, 7) }, today);
  const prev = href({ anchor: addDays(days[0], -step) });
  const next = href({ anchor: addDays(days[0], step) });

  // Hour range: 8 am – 8 pm, stretched to fit any visit outside it.
  const starts = events.map((e) => e.start);
  const startHour = Math.min(DEFAULT_START_HOUR, ...starts.map((s) => Math.floor(s / 60)));
  const endHour = Math.max(DEFAULT_END_HOUR, ...starts.map((s) => Math.ceil((s + SLOT_MINUTES) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const showsToday = days.includes(today);
  const firstStart = starts.length ? Math.min(...starts) : DEFAULT_START_HOUR * 60 + 60;
  const focus = showsToday ? nowMinutes - 60 : firstStart - 30;
  const scrollTo = ((focus - startHour * 60) / 60) * HOUR_PX;

  const byDay = new Map(days.map((d) => [d, [] as CalEvent[]]));
  events.forEach((e) => byDay.get(e.date)?.push(e));
  byDay.forEach((list) => list.sort((a, b) => a.start - b.start));
  const count = events.length;

  return (
    <section
      aria-label="Schedule"
      className="mt-8 overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--card)] fade-up"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_16rem]">
        {/* ── Left rail: month + legend ── */}
        <aside className="hidden border-r border-[var(--hairline)] bg-[var(--paper)] p-5 lg:block">
          <MiniMonth nav={nav} today={today} days={days} bookedDays={bookedDays} />
          <Legend className="mt-8" />
        </aside>

        {/* ── Main: toolbar + grid ── */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 className="font-display text-[28px] leading-none text-[var(--ink)]">{rangeTitle(days)}</h2>
              <p className="mt-1.5 text-[13px] text-[var(--ink-3)]">
                {count === 0 ? 'No visits in these days' : `${count} visit${count === 1 ? '' : 's'} in view`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ViewMenu nav={nav} href={href} />
              <Link href={href({ anchor: today })} className="editorial-btn-ghost btn-sm">
                Today
              </Link>
              <div className="flex items-center">
                <Link href={prev} aria-label={`Previous ${step === 1 ? 'day' : `${step} days`}`} className="grid h-8 w-8 place-items-center rounded-lg text-[18px] text-[var(--ink-2)] hover:bg-[var(--paper-soft)]">
                  ‹
                </Link>
                <Link href={next} aria-label={`Next ${step === 1 ? 'day' : `${step} days`}`} className="grid h-8 w-8 place-items-center rounded-lg text-[18px] text-[var(--ink-2)] hover:bg-[var(--paper-soft)]">
                  ›
                </Link>
              </div>
            </div>
          </div>

          {/* Narrow screens: the next visit, then an agenda list. */}
          <div className="md:hidden">
            {nextUp && (
              <div className="border-b border-[var(--hairline)] p-4">
                <NextUpCard nextUp={nextUp} />
              </div>
            )}
            <Agenda days={days} byDay={byDay} today={today} />
          </div>

          {/* Wider screens: the hour grid. */}
          <GridScroller scrollTo={scrollTo} className="relative hidden max-h-[640px] overflow-y-auto md:block">
            {/* Day headers */}
            <div
              className="sticky top-0 z-30 grid border-b border-[var(--hairline)] bg-[var(--card)]"
              style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
            >
              <div />
              {days.map((d) => {
                const isToday = d === today;
                return (
                  <div key={d} className="flex items-center justify-center gap-1.5 border-l border-[var(--hairline)] py-3">
                    <span className={`text-[12px] uppercase tracking-[0.08em] ${d < today ? 'text-[var(--ink-4)]' : 'text-[var(--ink-3)]'}`}>
                      {weekdayShort(d)}
                    </span>
                    <span
                      className={`grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-[14px] font-semibold ${
                        isToday ? 'bg-[var(--accent)] text-white' : d < today ? 'text-[var(--ink-4)]' : 'text-[var(--ink)]'
                      }`}
                      aria-current={isToday ? 'date' : undefined}
                    >
                      {dayOfMonth(d)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Hour grid */}
            <div className="grid" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="relative" style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h, i) =>
                  i === 0 ? null : (
                    <span
                      key={h}
                      className="absolute right-2 -translate-y-1/2 text-[10.5px] text-[var(--ink-4)]"
                      style={{ top: i * HOUR_PX }}
                    >
                      {hourLabel(h)}
                    </span>
                  ),
                )}
              </div>
              {days.map((d) => (
                <DayColumn
                  key={d}
                  date={d}
                  isToday={d === today}
                  isPast={d < today}
                  events={byDay.get(d) ?? []}
                  hours={hours}
                  startHour={startHour}
                  endHour={endHour}
                  compact={days.length > 3}
                />
              ))}
            </div>
          </GridScroller>
        </div>

        {/* ── Right rail: next visit + day counts ── */}
        <aside className="hidden border-l border-[var(--hairline)] bg-[var(--paper)] p-5 xl:block">
          {nextUp ? (
            <NextUpCard nextUp={nextUp} />
          ) : (
            <div>
              <Eyebrow>Next up</Eyebrow>
              <p className="mt-3 text-[14px] text-[var(--ink-3)]">Nothing booked ahead. New bookings appear here.</p>
            </div>
          )}
          {later.length > 0 && (
            <div className="mt-7">
              <Eyebrow>After that</Eyebrow>
              <ul className="mt-3 space-y-1">
                {later.map(({ event, when }) => (
                  <li key={event.id}>
                    <Link
                      href={`/consultations/${event.id}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 hover:bg-[var(--paper-soft)]"
                    >
                      <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: KIND_STYLE[event.kind].bar }} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-[var(--ink)]">{event.childName}</span>
                        <span className="block text-[12px] text-[var(--ink-3)]">{when}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <dl className="mt-7 grid grid-cols-3 gap-2 border-t border-[var(--hairline)] pt-5 text-center">
            <Stat label="Today" value={stats.today} />
            <Stat label="Summary ready" value={stats.ready} />
            <Stat label="Upcoming" value={stats.upcoming} />
          </dl>
        </aside>
      </div>
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--ink-3)]">{children}</div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="font-display text-[26px] leading-none text-[var(--ink)]">{value}</dd>
      <dt className="mt-1 text-[11px] leading-tight text-[var(--ink-3)]">{label}</dt>
    </div>
  );
}

function ViewMenu({ nav, href }: { nav: Nav; href: (p: Partial<Nav>) => string }) {
  const views: CalendarView[] = [1, 3, 7];
  return (
    <details className="relative hidden md:block [&_summary::-webkit-details-marker]:hidden">
      <summary className="editorial-btn-ghost btn-sm list-none" aria-label={`View: ${VIEW_LABEL[nav.view]}`}>
        {VIEW_LABEL[nav.view]}
        <span aria-hidden className="text-[10px] text-[var(--ink-3)]">▾</span>
      </summary>
      <ul className="absolute right-0 z-40 mt-2 w-36 rounded-xl border border-[var(--hairline-strong)] bg-[var(--card)] p-1 shadow-[2px_2px_0_var(--ink)]">
        {views.map((v) => (
          <li key={v}>
            <Link
              href={href({ view: v })}
              aria-current={v === nav.view ? 'true' : undefined}
              className={`block rounded-lg px-3 py-2 text-[13.5px] ${
                v === nav.view ? 'bg-[var(--accent-pale)] font-semibold text-[var(--accent)]' : 'text-[var(--ink-2)] hover:bg-[var(--paper-soft)]'
              }`}
            >
              {VIEW_LABEL[v]}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

function DayColumn({
  date,
  isToday,
  isPast,
  events,
  hours,
  startHour,
  endHour,
  compact,
}: {
  /** Narrow columns (week view): show only the start time. */
  compact: boolean;
  date: string;
  isToday: boolean;
  isPast: boolean;
  events: CalEvent[];
  hours: number[];
  startHour: number;
  endHour: number;
}) {
  const lanes = layoutLanes(events.map((e) => ({ start: e.start, end: e.start + SLOT_MINUTES })));
  return (
    <div
      className={`relative border-l border-[var(--hairline)] ${isPast ? 'bg-[var(--paper)]' : ''}`}
      style={{ height: hours.length * HOUR_PX }}
      aria-label={dayTitle(date)}
      role="group"
    >
      {hours.map((h, i) =>
        i === 0 ? null : (
          <div key={h} aria-hidden className="absolute inset-x-0 border-t border-[var(--hairline)]" style={{ top: i * HOUR_PX }} />
        ),
      )}
      {events.map((e, i) => {
        const { lane, lanes: n } = lanes[i];
        const s = KIND_STYLE[e.kind];
        const top = ((e.start - startHour * 60) / 60) * HOUR_PX;
        const height = (SLOT_MINUTES / 60) * HOUR_PX - 3;
        const timeRange = `${minutesToLabel(e.start)} – ${minutesToLabel(e.start + SLOT_MINUTES)}`;
        const state = e.status === 'completed' ? 'Completed' : e.status === 'no_show' ? 'No-show' : e.needsClosing ? 'Not closed yet' : e.late ? 'Late' : null;
        return (
          <Link
            key={e.id}
            href={`/consultations/${e.id}`}
            aria-label={`${e.childName}, ${dayTitle(e.date)}, ${timeRange}. ${KIND_LABEL[e.kind]}${state ? `. ${state}` : ''}`}
            title={[e.childName, timeRange, e.parentName ? `Parent · ${e.parentName}` : null, e.concern, state].filter(Boolean).join('\n')}
            className="group absolute z-10 overflow-hidden rounded-md border-l-[3px] px-2 py-[3px] leading-tight transition-shadow hover:z-30 hover:shadow-[0_2px_10px_rgba(11,22,50,0.14)] focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-soft)]"
            style={{
              top: top + 1,
              height,
              left: `calc(${(lane / n) * 100}% + 3px)`,
              width: `calc(${100 / n}% - 6px)`,
              background: s.bg,
              borderLeftColor: s.bar,
              color: s.text,
            }}
          >
            <span className={`block truncate text-[12.5px] font-semibold ${e.kind === 'closed' ? 'line-through decoration-1' : ''}`}>
              {e.childName}
              {e.late && <span className="ml-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#b93d27]">Late</span>}
            </span>
            <span className="block truncate text-[11px] opacity-80">{compact ? minutesToLabel(e.start) : timeRange}</span>
          </Link>
        );
      })}
      {isToday && <NowLine startHour={startHour} endHour={endHour} hourPx={HOUR_PX} />}
    </div>
  );
}

function Agenda({ days, byDay, today }: { days: string[]; byDay: Map<string, CalEvent[]>; today: string }) {
  return (
    <ol className="divide-y divide-[var(--hairline)]">
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        return (
          <li key={d} className="px-4 py-4">
            <div className="flex items-center gap-2">
              <span
                className={`grid h-8 min-w-8 place-items-center rounded-full px-1.5 text-[15px] font-semibold ${
                  d === today ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink)]'
                }`}
              >
                {dayOfMonth(d)}
              </span>
              <span className="text-[13px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                {weekdayShort(d)}
                {d === today ? ' · Today' : ''}
              </span>
            </div>
            {list.length === 0 ? (
              <p className="mt-2 pl-10 text-[13.5px] text-[var(--ink-4)]">No visits</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {list.map((e) => {
                  const s = KIND_STYLE[e.kind];
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/consultations/${e.id}`}
                        className="flex items-start gap-3 rounded-lg border-l-[3px] px-3 py-2.5"
                        style={{ background: s.bg, borderLeftColor: s.bar, color: s.text }}
                      >
                        <span className="w-[4.25rem] shrink-0 pt-px font-mono text-[12px]">{minutesToLabel(e.start)}</span>
                        <span className="min-w-0">
                          <span className={`block truncate text-[14.5px] font-semibold ${e.kind === 'closed' ? 'line-through decoration-1' : ''}`}>
                            {e.childName}
                            {e.late && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#b93d27]">Late</span>}
                          </span>
                          {e.concern && <span className="block truncate text-[12.5px] opacity-80">{e.concern}</span>}
                          <span className="block text-[11.5px] opacity-70">{KIND_LABEL[e.kind]}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function NextUpCard({ nextUp }: { nextUp: NextUp }) {
  const { event: e, when, meetLink, urgency } = nextUp;
  const s = KIND_STYLE[e.kind];
  return (
    <div>
      <Eyebrow>Next up</Eyebrow>
      <div className="mt-3 rounded-xl border-l-[3px] p-4" style={{ background: s.bg, borderLeftColor: s.bar }}>
        <div className="text-[12.5px] font-semibold" style={{ color: s.text }}>
          {when}
        </div>
        <div className="mt-1 font-display text-[24px] leading-tight text-[var(--ink)]">{e.childName}</div>
        <div className="mt-0.5 text-[13px] text-[var(--ink-2)]">
          {minutesToLabel(e.start)} – {minutesToLabel(e.start + SLOT_MINUTES)} · Video consult
        </div>
        {e.parentName && <div className="mt-0.5 text-[13px] text-[var(--ink-3)]">Parent · {e.parentName}</div>}
        {e.concern && <p className="mt-2 line-clamp-2 text-[13px] text-[var(--ink-2)]">{e.concern}</p>}
        {urgency && urgency !== 'routine' && <UrgencyBadge urgency={urgency} className="mt-3" />}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {meetLink ? (
          <a href={meetLink} target="_blank" rel="noreferrer" className="btn-go btn-sm">
            Join video
          </a>
        ) : (
          <Link href="/settings" className="btn-peach btn-sm">
            Set video link
          </Link>
        )}
        <Link href={`/consultations/${e.id}`} className="editorial-btn-ghost btn-sm">
          Open visit
        </Link>
      </div>
    </div>
  );
}

function MiniMonth({
  nav,
  days,
  bookedDays,
  today,
}: {
  nav: Nav;
  today: string;
  days: string[];
  bookedDays: Set<string>;
}) {
  const cells = monthGrid(nav.month);
  const inView = new Set(days);
  const monthHref = (m: string) => scheduleHref({ ...nav, month: m }, today);
  return (
    <nav aria-label="Pick a day">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-[var(--ink)]">{monthTitle(`${nav.month}-01`)}</span>
        <span className="flex">
          <Link href={monthHref(shiftMonth(nav.month, -1))} aria-label="Previous month" className="grid h-7 w-7 place-items-center rounded-md text-[16px] text-[var(--ink-3)] hover:bg-[var(--paper-soft)]">
            ‹
          </Link>
          <Link href={monthHref(shiftMonth(nav.month, 1))} aria-label="Next month" className="grid h-7 w-7 place-items-center rounded-md text-[16px] text-[var(--ink-3)] hover:bg-[var(--paper-soft)]">
            ›
          </Link>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-7 text-center text-[10.5px] text-[var(--ink-4)]" aria-hidden>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {cells.map((d) => {
          const inMonth = d.slice(0, 7) === nav.month;
          const isToday = d === today;
          const selected = inView.has(d);
          return (
            <Link
              key={d}
              href={scheduleHref({ anchor: d, view: nav.view, month: d.slice(0, 7) }, today)}
              aria-label={`${dayTitle(d)}${bookedDays.has(d) ? ', has bookings' : ''}`}
              aria-current={isToday ? 'date' : undefined}
              className={`relative mx-auto grid h-7 w-7 place-items-center rounded-full text-[12px] ${
                isToday
                  ? 'bg-[var(--accent)] font-semibold text-white'
                  : selected
                    ? 'bg-[var(--accent-pale)] font-semibold text-[var(--accent)]'
                    : inMonth
                      ? 'text-[var(--ink-2)] hover:bg-[var(--paper-soft)]'
                      : 'text-[var(--ink-4)] hover:bg-[var(--paper-soft)]'
              }`}
            >
              {dayOfMonth(d)}
              {bookedDays.has(d) && !isToday && (
                <span aria-hidden className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[var(--accent-soft)]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Legend({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Eyebrow>Colours</Eyebrow>
      <ul className="mt-3 space-y-2">
        {ORDERED_KINDS.map((k) => (
          <li key={k} className="flex items-center gap-2.5 text-[12.5px] text-[var(--ink-2)]">
            <span
              aria-hidden
              className="h-3.5 w-3.5 rounded-[4px] border-l-[3px]"
              style={{ background: KIND_STYLE[k].bg, borderLeftColor: KIND_STYLE[k].bar }}
            />
            {KIND_LABEL[k]}
          </li>
        ))}
      </ul>
    </div>
  );
}
