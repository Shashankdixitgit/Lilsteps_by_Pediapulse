import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type QueueRow = {
  id: string;
  date: string;
  time: string;
  status: string;
  summary_ready: boolean;
  ai_summary_id: string | null;
  children: { id: string; name: string; dob: string; sex: string } | null;
};

function computeAge(dob: string): string {
  const d = new Date(dob);
  const now = new Date();
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (months < 1) return 'Newborn';
  if (months < 24) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} yr` : `${years} yr ${rest} mo`;
}

function formatWhen(iso: string, time: string): { date: string; time: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' }),
    time: time.slice(0, 5),
  };
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
      Pending
    </span>
  );
}

const COLS = 'grid-cols-[2.5rem_9rem_minmax(0,1fr)_8rem_7rem]';

export default async function QueuePage() {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('appointments')
    .select(
      'id, date, time, status, summary_ready, ai_summary_id, children(id, name, dob, sex)',
    )
    .gte('date', today)
    .in('status', ['upcoming'])
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .returns<QueueRow[]>();

  const today_str = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();

  const total = data?.length ?? 0;
  const ready = data?.filter((a) => a.summary_ready).length ?? 0;
  const awaiting = total - ready;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-12">
      {/* Header */}
      <header className="fade-up">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Queue · {today_str}
        </div>
        <h1 className="mt-2 font-display text-[40px] leading-tight text-[var(--ink)]">
          Today&apos;s Consultations
        </h1>
      </header>

      {/* Summary stats */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 fade-up">
        <StatCard label="Pending" value={total} hint="Appointments scheduled" />
        <StatCard label="Summary ready" value={ready} hint="Pre-consult notes prepared" />
        <StatCard label="Awaiting summary" value={awaiting} hint="No notes yet" />
      </section>

      {error && (
        <div className="mt-10 rounded-xl border border-[var(--hairline-strong)] border-l-2 border-l-[var(--ink)] bg-[var(--card)] px-5 py-4 font-mono text-[13px] text-[var(--ink)]">
          {error.message}
        </div>
      )}

      {/* Appointments table */}
      {!error && (
        <section className="mt-10 fade-up">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[20px] text-[var(--ink)]">Appointments</h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
              {total} scheduled
            </span>
          </div>

          {total === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-[var(--hairline-strong)] bg-[var(--card)] py-20 text-center">
              <p className="font-display text-[20px] text-[var(--ink-2)]">
                No appointments today
              </p>
              <p className="mt-2 text-[14px] text-[var(--ink-3)]">
                New bookings appear here as patients schedule them.
              </p>
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--card)]">
              {/* Column headers */}
              <div
                className={`grid ${COLS} items-center gap-4 border-b border-[var(--hairline)] bg-[var(--paper-soft)] px-6 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]`}
              >
                <span>#</span>
                <span>When</span>
                <span>Patient</span>
                <span>Details</span>
                <span className="text-right">Summary</span>
              </div>

              {/* Rows */}
              {data!.map((appt, idx) => {
                const child = appt.children;
                const when = formatWhen(appt.date, appt.time);
                return (
                  <Link
                    key={appt.id}
                    href={`/consultations/${appt.id}`}
                    className={`grid ${COLS} items-center gap-4 border-b border-[var(--hairline)] px-6 py-4 transition-colors last:border-0 hover:bg-[var(--paper-soft)]`}
                  >
                    <span className="font-mono text-[12px] text-[var(--ink-4)]">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-[14px] text-[var(--ink)]">{when.date}</span>
                      <span className="font-mono text-[12px] text-[var(--ink-3)]">{when.time}</span>
                    </div>
                    <span className="truncate text-[16px] font-medium text-[var(--ink)]">
                      {child?.name ?? 'Unknown'}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                      <span>{child ? computeAge(child.dob) : '—'}</span>
                      <span className="text-[var(--hairline-strong)]">·</span>
                      <span>{child?.sex ?? '—'}</span>
                    </div>
                    <div className="text-right">
                      <SummaryBadge ready={appt.summary_ready} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
