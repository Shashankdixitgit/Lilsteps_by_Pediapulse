import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type PrescriptionRow = {
  id: string;
  issued_at: string;
  notes: string | null;
  child_id: string;
  children: { id: string; name: string } | null;
  prescription_items: {
    id: string;
    medicine: string;
    dose: string;
    frequency: string;
    duration: string | null;
    position: number;
  }[];
};

function formatStamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d
      .toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' })
      .toUpperCase(),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

export default async function PrescriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const { child: childFilter } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let q = supabase
    .from('prescriptions')
    .select(
      'id, issued_at, notes, child_id, children(id, name), prescription_items(id, medicine, dose, frequency, duration, position)',
    )
    .order('issued_at', { ascending: false });

  if (childFilter) q = q.eq('child_id', childFilter);

  const { data, error } = await q.returns<PrescriptionRow[]>();

  const childName = data?.find((p) => p.children?.id === childFilter)?.children?.name;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-16">
      <header className="mb-14 flex items-end justify-between gap-6 fade-up">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
            {childName ? 'For patient' : 'Pharmacopoeia'}
          </div>
          <h1 className="mt-4 font-display text-[56px] leading-[0.95] tracking-[-0.03em] text-[var(--ink)]">
            {childName ? (
              <>
                <span className="font-display-italic">{childName}&apos;s</span>
                <br />
                prescriptions
              </>
            ) : (
              <>
                All <span className="font-display-italic">prescriptions</span>
              </>
            )}
          </h1>
        </div>
        {childFilter && (
          <Link
            href={`/prescriptions/new?child=${childFilter}`}
            className="editorial-btn"
          >
            New prescription
          </Link>
        )}
      </header>

      {error && (
        <div className="border-l-2 border-[var(--alert)] px-5 py-4 font-mono text-[13px] text-[var(--alert)]">
          {error.message}
        </div>
      )}

      {!error && (!data || data.length === 0) && (
        <div className="border-t border-[var(--hairline)] py-24 text-center">
          <p className="font-display-italic text-[28px] text-[var(--ink-3)]">
            Nothing issued yet.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <ol className="space-y-10">
          {data.map((p, idx) => {
            const items = [...p.prescription_items].sort((a, b) => a.position - b.position);
            const stamp = formatStamp(p.issued_at);
            return (
              <li
                key={p.id}
                className="fade-up grid grid-cols-[3.5rem_1fr] gap-6 border-t border-[var(--hairline)] pt-6"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-4)]">
                  Rx
                  <br />
                  {String(idx + 1).padStart(3, '0')}
                </div>
                <div>
                  <div className="flex items-baseline justify-between border-b border-[var(--hairline)] pb-3">
                    {!childFilter && (
                      <div className="font-display-italic text-[24px] text-[var(--ink)]">
                        {p.children?.name ?? 'Unknown'}
                      </div>
                    )}
                    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                      {stamp.date} · {stamp.time}
                    </div>
                  </div>
                  {items.length > 0 && (
                    <ul className="mt-5 space-y-4">
                      {items.map((it) => (
                        <li
                          key={it.id}
                          className="grid grid-cols-[2rem_1fr] gap-4 border-l border-[var(--accent-pale)] pl-4"
                        >
                          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">
                            ℞{it.position + 1}
                          </div>
                          <div>
                            <div className="font-display text-[20px] leading-tight text-[var(--ink)]">
                              {it.medicine}
                            </div>
                            <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-2)]">
                              {it.dose} · {it.frequency}
                              {it.duration ? ` · ${it.duration}` : ''}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.notes && (
                    <p className="mt-5 border-l-2 border-[var(--highlight)] bg-[var(--card-overlay)] py-3 px-4 font-display-italic text-[15px] leading-[1.55] text-[var(--ink-2)]">
                      {p.notes}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
