import Link from 'next/link';
import { redirect } from 'next/navigation';
import { dayOfMonth, dayTitle, isIsoDate, isIsoMonth, monthGrid, monthTitle, shiftMonth } from '@/lib/calendar';
import { getCurrentDoctor } from '@/lib/doctor';
import { todayIst } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AddSlots } from './add-slots';
import { SlotsDay, type DaySlots } from './slots-day';

type SlotRow = {
  id: string;
  date: string;
  time: string;
  is_available: boolean;
};

type BookedRow = {
  id: string;
  date: string;
  time: string;
  status: string;
  followup_of: string | null;
  children: { name: string } | null;
};

type DayInfo = { open: number; total: number };

/** /availability?d=YYYY-MM-DD (selected day) &m=YYYY-MM (month shown). */
function availabilityHref(day: string, month: string, today: string): string {
  const q = new URLSearchParams();
  if (day !== today) q.set('d', day);
  if (month !== day.slice(0, 7)) q.set('m', month);
  const s = q.toString();
  return s ? `/availability?${s}` : '/availability';
}

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; m?: string }>;
}) {
  const { d, m } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const doctor = await getCurrentDoctor(supabase);
  if (!doctor) redirect('/login');
  // Clinic-local (IST). The server is UTC, so a 5am-IST visit on May 31
  // would otherwise compute 'today' as May 30 and show stale slots.
  const todayIso = todayIst();

  // time_slots is readable by everyone (parents browse it), so filter to
  // this doctor explicitly — RLS alone would show every doctor's slots.
  const [{ data, error }, { data: booked }] = await Promise.all([
    supabase
      .from('time_slots')
      .select('id, date, time, is_available')
      .eq('doctor_id', doctor.doctorId)
      .gte('date', todayIso)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .returns<SlotRow[]>(),
    supabase
      .from('appointments')
      .select('id, date, time, status, followup_of, children(name)')
      .eq('doctor_id', doctor.doctorId)
      .gte('date', todayIso)
      .neq('status', 'cancelled')
      .returns<BookedRow[]>(),
  ]);

  // A family mid-payment holds the slot (0045) but isn't booked yet: show it
  // as held, without their name or a link, until the payment goes through.
  // A follow-up the doctor booked (0051) is theirs: named, with a link.
  const bookedByKey = new Map<string, { appointmentId: string; childName: string; held: boolean; followup: boolean }>();
  (booked ?? []).forEach((b) =>
    bookedByKey.set(`${b.date} ${b.time}`, {
      appointmentId: b.id,
      childName: b.children?.name ?? 'patient',
      held: b.status === 'awaiting_payment',
      followup: b.status === 'awaiting_payment' && !!b.followup_of,
    }),
  );

  // Group by date
  const byDate = new Map<string, DaySlots>();
  (data ?? []).forEach((s) => {
    const item = { ...s, booking: bookedByKey.get(`${s.date} ${s.time}`) ?? null };
    const existing = byDate.get(s.date);
    if (existing) existing.items.push(item);
    else byDate.set(s.date, { date: s.date, items: [item] });
  });
  const info = new Map<string, DayInfo>();
  byDate.forEach((day, date) =>
    info.set(date, {
      open: day.items.filter((s) => s.is_available && !s.booking).length,
      total: day.items.length,
    }),
  );

  // Selected day: ?d= when it is today or later, else today if it has
  // slots, else the first day that does.
  const firstWithSlots = byDate.keys().next().value as string | undefined;
  const selected =
    isIsoDate(d) && d >= todayIso ? d : byDate.has(todayIso) ? todayIso : firstWithSlots ?? todayIso;
  const month = isIsoMonth(m) ? m : selected.slice(0, 7);
  const selectedDay: DaySlots = byDate.get(selected) ?? { date: selected, items: [] };
  const upcomingDays = byDate.size;
  const openTotal = [...info.values()].reduce((n, x) => n + x.open, 0);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 fade-up">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Calendar</div>
          <h1 className="mt-2 font-display text-[32px] leading-tight text-[var(--ink)] sm:text-[40px]">Availability</h1>
          <p className="mt-2 text-[15px] text-[var(--ink-3)]">
            Parents only see open slots. Pick a day to close or reopen its slots.
          </p>
        </div>
        <AddSlots defaultStartDate={selected} />
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-[var(--hairline-strong)] border-l-2 border-l-[var(--ink)] px-5 py-4 font-mono text-[13px] text-[var(--ink)]">
          {error.message}
        </div>
      )}

      <section
        aria-label="Availability calendar"
        className="overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--card)] fade-up"
      >
        <div className="grid grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)]">
          {/* ── Left: month ── */}
          <aside className="border-b border-[var(--hairline)] bg-[var(--paper)] p-5 md:border-b-0 md:border-r">
            <SlotMonth month={month} selected={selected} today={todayIso} info={info} />
            <ul className="mt-6 space-y-1.5 text-[12px] text-[var(--ink-3)]">
              <li className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent-soft)]" />
                Has open slots
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--ink-4)]" />
                Slots, none open
              </li>
            </ul>
            <p className="mt-6 border-t border-[var(--hairline)] pt-4 text-[12.5px] leading-[1.5] text-[var(--ink-3)]">
              {upcomingDays === 0
                ? 'No upcoming slots yet.'
                : `${openTotal} open slot${openTotal === 1 ? '' : 's'} across ${upcomingDays} upcoming day${upcomingDays === 1 ? '' : 's'}.`}
            </p>
          </aside>

          {/* ── Right: the selected day ── */}
          <div className="min-w-0">
            <SlotsDay key={selected} day={selectedDay} title={dayTitle(selected)} isToday={selected === todayIso} />
          </div>
        </div>
      </section>
    </main>
  );
}

function SlotMonth({
  month,
  selected,
  today,
  info,
}: {
  month: string;
  selected: string;
  today: string;
  info: Map<string, DayInfo>;
}) {
  const cells = monthGrid(month);
  const monthHref = (mm: string) => availabilityHref(selected, mm, today);
  const navBtn = 'grid h-7 w-7 place-items-center rounded-md text-[16px] text-[var(--ink-3)] hover:bg-[var(--paper-soft)]';
  return (
    <nav aria-label="Pick a day">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-[var(--ink)]">{monthTitle(`${month}-01`)}</span>
        <span className="flex">
          {month > today.slice(0, 7) ? (
            <Link href={monthHref(shiftMonth(month, -1))} aria-label="Previous month" className={navBtn}>
              ‹
            </Link>
          ) : (
            <span aria-hidden className={`${navBtn} opacity-30`}>‹</span>
          )}
          <Link href={monthHref(shiftMonth(month, 1))} aria-label="Next month" className={navBtn}>
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
        {cells.map((day) => {
          const inMonth = day.slice(0, 7) === month;
          const past = day < today;
          const isToday = day === today;
          const isSelected = day === selected;
          const di = info.get(day);
          const base = 'relative mx-auto grid h-8 w-8 place-items-center rounded-full text-[12.5px]';
          if (past) {
            return (
              <span key={day} aria-hidden className={`${base} text-[var(--ink-4)] opacity-40`}>
                {dayOfMonth(day)}
              </span>
            );
          }
          const label = `${dayTitle(day)}${di ? `, ${di.open} of ${di.total} slots open` : ', no slots'}`;
          return (
            <Link
              key={day}
              href={availabilityHref(day, day.slice(0, 7), today)}
              aria-label={label}
              aria-current={isSelected ? 'date' : undefined}
              className={`${base} ${
                isSelected
                  ? 'bg-[var(--accent)] font-semibold text-white'
                  : isToday
                    ? 'bg-[var(--accent-pale)] font-semibold text-[var(--accent)]'
                    : inMonth
                      ? 'text-[var(--ink-2)] hover:bg-[var(--paper-soft)]'
                      : 'text-[var(--ink-4)] hover:bg-[var(--paper-soft)]'
              }`}
            >
              {dayOfMonth(day)}
              {di && !isSelected && (
                <span
                  aria-hidden
                  className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                    di.open > 0 ? 'bg-[var(--accent-soft)]' : 'bg-[var(--ink-4)]'
                  }`}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
