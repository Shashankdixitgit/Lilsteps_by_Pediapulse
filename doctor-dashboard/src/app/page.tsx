import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchConcerns, fetchUrgencies, type Urgency } from '@/lib/appointments';
import { getCurrentDoctor, hasVideoLink } from '@/lib/doctor';
import {
  computeAge,
  formatDayLong,
  formatClock,
  formatDayShort,
  formatSlotTime,
  istDatePlus,
  nowIstTime,
  relativeDayLabel,
  todayIst,
} from '@/lib/format';
import { Suspense } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { FlashToast } from './flash-toast';
import { LateBadge, UrgencyBadge } from './urgency-badge';
import { VideoLinkBanner } from './video-link-banner';

type QueueRow = {
  id: string;
  date: string;
  time: string;
  status: string;
  summary_ready: boolean;
  ai_summary_id: string | null;
  children: { id: string; name: string; dob: string; sex: string } | null;
  parents: { name: string | null } | null;
};

/** A closed visit plus when it was closed (consultations.created_at), if known. */
type ClosedRow = QueueRow & { closedAt: string | null };

const QUEUE_SELECT =
  'id, date, time, status, summary_ready, ai_summary_id, children(id, name, dob, sex), parents(name)';

const CLOSED_LABEL: Record<string, string> = {
  completed: 'Completed',
  no_show: 'No-show',
};

function formatWhen(iso: string, time: string): { date: string; time: string } {
  return { date: relativeDayLabel(iso) ?? formatDayShort(iso), time: formatSlotTime(time) };
}

/** "today" / "yesterday" / "Thu, 8 Oct" for the IST day of a timestamp. */
function closedDayLabel(ts: string): string {
  const istDay = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return relativeDayLabel(istDay)?.toLowerCase() ?? formatDayShort(istDay);
}

/**
 * Closed visits: lead with when the visit was closed ("Closed today, 3:42 pm"),
 * then the booked slot, labelled. A visit closed early used to show only its
 * slot ("Tomorrow") under "Recently closed", which read like a future visit.
 */
function ClosedWhen({ closedAt, date, time }: { closedAt: string | null; date: string; time: string }) {
  const slotDay = relativeDayLabel(date)?.toLowerCase() ?? formatDayShort(date);
  return (
    <div className="flex flex-col">
      {closedAt ? (
        <>
          <span className="text-[14px] text-[var(--ink)]">Closed {closedDayLabel(closedAt)}</span>
          <span className="font-mono text-[12px] text-[var(--ink-3)]">{formatClock(closedAt)}</span>
        </>
      ) : null}
      <span className={closedAt ? 'mt-1 text-[12px] text-[var(--ink-3)]' : 'text-[14px] text-[var(--ink)]'}>
        Booked for {slotDay}, {formatSlotTime(time)}
      </span>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--card)] p-6">
      <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
        {label}
      </div>
      <div className="mt-3 font-display text-[40px] leading-none text-[var(--ink)]">{value}</div>
      <div className="mt-2 text-[13px] text-[var(--ink-3)]">{hint}</div>
    </div>
  );
}

function ClosedBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--hairline-strong)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
      {CLOSED_LABEL[status] ?? status}
    </span>
  );
}

function SummaryBadge({ ready }: { ready: boolean }) {
  if (ready) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ink)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink)]" />
        Ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline-strong)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink-4)]" />
      No summary
    </span>
  );
}

// min-w keeps columns readable on narrow screens; the table scrolls sideways instead.
const COLS = 'min-w-[44rem] grid-cols-[2.5rem_9rem_minmax(0,1fr)_8rem_7rem]';

// How far back unclosed visits stay in "Needs closing" before they drop off.
const OPEN_VISIT_LOOKBACK_DAYS = 30;

// How far back closed visits stay in "Recently closed".
const CLOSED_LOOKBACK_DAYS = 7;

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string }>;
}) {
  const { closed } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const doctor = await getCurrentDoctor(supabase);
  if (!doctor) redirect('/login');
  // Clinic-local (IST). The server runs in UTC, so new Date().toISOString()
  // would still say "yesterday" until 5:30am IST.
  const today = todayIst();

  // Only live visits: completed / no-show / cancelled drop out of the queue.
  // Closed visits from the last 7 days stay visible under "Recently closed".
  // A visit can be closed before its booked date, so "recent" is judged by
  // when it was closed (consultations.created_at: the row is written only
  // when the visit is closed) as well as by the booked date.
  const closedSince = `${istDatePlus(-CLOSED_LOOKBACK_DAYS)}T00:00:00+05:30`;
  const [{ data, error }, { data: closedByDate }, { data: recentConsults }] = await Promise.all([
    supabase
      .from('appointments')
      .select(QUEUE_SELECT)
      .eq('doctor_id', doctor.doctorId)
      .eq('status', 'upcoming')
      .gte('date', istDatePlus(-OPEN_VISIT_LOOKBACK_DAYS))
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .returns<QueueRow[]>(),
    supabase
      .from('appointments')
      .select(QUEUE_SELECT)
      .eq('doctor_id', doctor.doctorId)
      .gte('date', istDatePlus(-CLOSED_LOOKBACK_DAYS))
      .lte('date', today)
      .in('status', ['completed', 'no_show'])
      .returns<QueueRow[]>(),
    supabase
      .from('consultations')
      .select('appointment_id, created_at')
      .gte('created_at', closedSince)
      .returns<{ appointment_id: string; created_at: string }[]>(),
  ]);

  const closedAtByAppt = new Map((recentConsults ?? []).map((c) => [c.appointment_id, c.created_at]));
  const knownClosedIds = new Set((closedByDate ?? []).map((r) => r.id));
  const extraIds = [...closedAtByAppt.keys()].filter((id) => !knownClosedIds.has(id));
  const { data: closedEarly } = extraIds.length
    ? await supabase
        .from('appointments')
        .select(QUEUE_SELECT)
        .eq('doctor_id', doctor.doctorId)
        .in('id', extraIds)
        .in('status', ['completed', 'no_show'])
        .returns<QueueRow[]>()
    : { data: [] as QueueRow[] };

  const rows = data ?? [];
  // Most recently closed first; visits with no consultations row fall back to their slot.
  const recentlyClosed: ClosedRow[] = [...(closedByDate ?? []), ...(closedEarly ?? [])]
    .map((r) => ({ ...r, closedAt: closedAtByAppt.get(r.id) ?? null }))
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  const allRows = [...rows, ...recentlyClosed];
  const [concerns, urgencies] = await Promise.all([
    fetchConcerns(supabase, allRows.map((r) => r.id)),
    fetchUrgencies(supabase, allRows),
  ]);
  const overdue = rows.filter((a) => a.date < today);
  // Urgent visits first within today (R2-11): an urgent 3-week-old used to sit
  // below a routine visit just because its slot was later. The rows arrive
  // ordered by date and time, and the sort is stable, so that order holds
  // inside each group.
  const todays = rows
    .filter((a) => a.date === today)
    .sort((a, b) => urgentFirst(urgencies.get(a.id)) - urgentFirst(urgencies.get(b.id)));
  const later = rows.filter((a) => a.date > today);

  // Today's open visits whose slot has started are marked Late.
  const now = nowIstTime();
  const lateIds = new Set(todays.filter((a) => a.time <= now).map((a) => a.id));

  const today_str = formatDayLong(new Date().toISOString()).toUpperCase();
  const todayReady = todays.filter((a) => a.summary_ready).length;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-8">
      {closed && (
        <Suspense>
          <FlashToast param="closed" message={closed.slice(0, 120)} />
        </Suspense>
      )}
      {/* Header */}
      <header className="fade-up">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Queue · {today_str}
        </div>
        <h1 className="mt-2 font-display text-[40px] leading-tight text-[var(--ink)]">
          Today&apos;s Consultations
        </h1>
      </header>

      {!hasVideoLink(doctor) && <VideoLinkBanner className="mt-8" />}

      {/* Summary stats */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 fade-up">
        <StatCard label="Today" value={todays.length} hint="Consultations scheduled today" />
        <StatCard label="Summary ready" value={todayReady} hint="Today, with AI pre-visit notes" />
        <StatCard label="Upcoming" value={later.length} hint="Booked for later days" />
      </section>

      {error && (
        <div className="mt-10 rounded-xl border border-[var(--hairline-strong)] border-l-2 border-l-[var(--ink)] bg-[var(--card)] px-5 py-4 font-mono text-[13px] text-[var(--ink)]">
          {error.message}
        </div>
      )}

      {!error && (
        <>
          {overdue.length > 0 && (
            <QueueTable
              title="Needs closing"
              hint="Past visits not yet marked complete or no-show"
              rows={overdue}
              concerns={concerns}
              urgencies={urgencies}
            />
          )}
          <QueueTable
            title="Today"
            hint={`${todays.length} scheduled`}
            rows={todays}
            concerns={concerns}
            urgencies={urgencies}
            lateIds={lateIds}
            emptyTitle="No appointments today"
            emptyBody="New bookings for today appear here as parents schedule them."
          />
          <QueueTable
            title="Upcoming"
            hint={`${later.length} booked`}
            rows={later}
            concerns={concerns}
            urgencies={urgencies}
            emptyTitle="Nothing booked yet"
            emptyBody="Bookings for later days appear here."
          />
          {recentlyClosed.length > 0 && (
            <QueueTable
              title="Recently closed"
              hint={`${recentlyClosed.length} in the last ${CLOSED_LOOKBACK_DAYS} days`}
              rows={recentlyClosed}
              concerns={concerns}
              urgencies={urgencies}
              closed
            />
          )}
        </>
      )}
    </main>
  );
}

/** 0 for an urgent visit, 1 for the rest: sorts urgent visits to the top. */
function urgentFirst(u: Urgency | undefined): number {
  return u === 'urgent' ? 0 : 1;
}

/** Sort key for a closed visit: when it was closed, else its booked slot. */
function sortKey(r: ClosedRow): string {
  return r.closedAt ?? `${r.date}T${r.time}`;
}

function QueueTable({
  title,
  hint,
  rows,
  concerns,
  urgencies,
  lateIds,
  closed,
  emptyTitle,
  emptyBody,
}: {
  title: string;
  hint: string;
  rows: (QueueRow & { closedAt?: string | null })[];
  concerns: Map<string, string>;
  urgencies: Map<string, Urgency>;
  /** Today's open visits whose slot time has passed. */
  lateIds?: Set<string>;
  /** Completed / no-show rows: show the outcome instead of the summary state. */
  closed?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  return (
    <section className="mt-10 fade-up">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[20px] text-[var(--ink)]">{title}</h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
          {hint}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[var(--hairline-strong)] bg-[var(--card)] py-14 text-center">
          <p className="font-display text-[20px] text-[var(--ink-2)]">{emptyTitle}</p>
          <p className="mt-2 text-[14px] text-[var(--ink-3)]">{emptyBody}</p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--hairline)] bg-[var(--card)]">
          {/* Column headers */}
          <div
            className={`grid ${COLS} items-center gap-4 border-b border-[var(--hairline)] bg-[var(--paper-soft)] px-6 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]`}
          >
            <span>#</span>
            <span>{closed ? 'Closed' : 'When'}</span>
            <span>Patient</span>
            <span>Details</span>
            <span className="text-right">{closed ? 'Outcome' : 'Summary'}</span>
          </div>

          {/* Rows */}
          {rows.map((appt, idx) => {
            const child = appt.children;
            const when = formatWhen(appt.date, appt.time);
            const concern = concerns.get(appt.id);
            const urgency = urgencies.get(appt.id);
            // Open urgent visits get a heavy left rule so they stand out in the list.
            const flagged = !closed && urgency === 'urgent';
            const parentName = appt.parents?.name?.trim();
            return (
              <Link
                key={appt.id}
                href={`/consultations/${appt.id}`}
                className={`grid ${COLS} items-center gap-4 border-b border-[var(--hairline)] px-6 py-4 transition-colors last:border-b-0 hover:bg-[var(--paper-soft)] ${
                  flagged ? 'border-l-[3px] border-l-[var(--ink)] bg-[var(--paper-soft)]' : ''
                } ${closed ? 'text-[var(--ink-3)]' : ''}`}
              >
                <span className="font-mono text-[12px] text-[var(--ink-4)]">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                {closed ? (
                  <ClosedWhen closedAt={appt.closedAt ?? null} date={appt.date} time={appt.time} />
                ) : (
                  <div className="flex flex-col">
                    <span className="text-[14px] text-[var(--ink)]">{when.date}</span>
                    <span className="font-mono text-[12px] text-[var(--ink-3)]">{when.time}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[16px] font-medium text-[var(--ink)]">
                      {child?.name ?? 'Unknown'}
                    </span>
                    {!closed && <UrgencyBadge urgency={urgency} className="shrink-0" />}
                    {!closed && lateIds?.has(appt.id) && <LateBadge className="shrink-0" />}
                  </div>
                  <div className="truncate text-[13px] text-[var(--ink-2)]">
                    Parent · {parentName || '—'}
                  </div>
                  {concern && (
                    <div className="truncate text-[13px] text-[var(--ink-3)]">{concern}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                  <span>{child ? computeAge(child.dob) : '—'}</span>
                  <span className="text-[var(--hairline-strong)]">·</span>
                  <span>{child?.sex ?? '—'}</span>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  {closed ? <ClosedBadge status={appt.status} /> : <SummaryBadge ready={appt.summary_ready} />}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
