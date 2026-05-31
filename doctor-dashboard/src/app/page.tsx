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
  if (months < 1) return 'newborn';
  if (months < 24) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} yr` : `${years} yr · ${rest} mo`;
}

function formatDate(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: d.toLocaleDateString('en-US', { day: '2-digit' }),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

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

  const today_str = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-16">
      {/* Editorial hero */}
      <header className="mb-16 fade-up">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Vol. I · {today_str}
        </div>
        <h1 className="mt-4 font-display text-[64px] leading-[0.95] tracking-[-0.03em] text-[var(--ink)]">
          The day&apos;s
          <br />
          <span className="font-display-italic">consultations</span>
        </h1>
        <div className="mt-6 flex items-baseline gap-6 border-t border-[var(--hairline)] pt-5">
          <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
            {data?.length ?? 0} {data?.length === 1 ? 'entry' : 'entries'} pending
          </span>
          <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
            {data?.filter((a) => a.summary_ready).length ?? 0} with summary
          </span>
        </div>
      </header>

      {error && (
        <div className="border-l-2 border-[var(--alert)] bg-[var(--card)] px-5 py-4 font-mono text-[13px] text-[var(--alert)]">
          {error.message}
        </div>
      )}

      {!error && (!data || data.length === 0) && (
        <div className="border-t border-[var(--hairline)] py-24 text-center">
          <p className="font-display-italic text-[28px] text-[var(--ink-3)]">
            No appointments today.
          </p>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-4)]">
            — fin —
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <ol className="space-y-0">
          {data.map((appt, idx) => {
            const child = appt.children;
            const date = formatDate(appt.date);
            const time = appt.time.slice(0, 5);
            return (
              <li
                key={appt.id}
                className="fade-up group grid grid-cols-[3rem_5.5rem_1fr_auto] items-baseline gap-6 border-t border-[var(--hairline)] py-6 transition-colors hover:bg-[var(--card-overlay)]"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                {/* Chart number */}
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-4)]">
                  {String(idx + 1).padStart(3, '0')}
                </div>

                {/* Date stamp */}
                <div className="flex flex-col">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                    {date.weekday} {date.month}
                  </span>
                  <span className="font-display text-[28px] leading-[1] text-[var(--ink)]">
                    {date.day}
                  </span>
                  <span className="mt-1 font-mono text-[11px] tracking-[0.1em] text-[var(--ink-2)]">
                    {time}
                  </span>
                </div>

                {/* Patient */}
                <div>
                  <Link
                    href={`/consultations/${appt.id}`}
                    className="link-underline font-display-italic text-[26px] leading-tight text-[var(--ink)]"
                  >
                    {child?.name ?? 'Unknown'}
                  </Link>
                  <div className="mt-1 flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                    <span>{child ? computeAge(child.dob) : '—'}</span>
                    <span className="text-[var(--hairline-strong)]">·</span>
                    <span>{child?.sex ?? '—'}</span>
                  </div>
                </div>

                {/* Summary status */}
                <div className="text-right">
                  {appt.summary_ready ? (
                    <span className="inline-flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                      Summary ready
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-4)]">
                      — pending —
                    </span>
                  )}
                </div>
              </li>
            );
          })}
          <li className="border-t border-[var(--hairline)]" />
        </ol>
      )}
    </main>
  );
}
