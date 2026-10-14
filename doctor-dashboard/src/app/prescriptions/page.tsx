import Link from 'next/link';
import { Suspense } from 'react';
import { computeAge, formatDateTime } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { FlashToast } from '../flash-toast';

type PrescriptionRow = {
  id: string;
  issued_at: string;
  notes: string | null;
  child_id: string;
  appointment_id: string | null;
  children: { id: string; name: string; dob: string | null; parents: { name: string | null } | null } | null;
  prescription_items: {
    id: string;
    medicine: string;
    dose: string;
    frequency: string;
    duration: string | null;
    position: number;
  }[];
};

export default async function PrescriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string; issued?: string }>;
}) {
  const { child: childFilter, issued } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let q = supabase
    .from('prescriptions')
    .select(
      'id, issued_at, notes, child_id, appointment_id, children(id, name, dob, parents(name)), prescription_items(id, medicine, dose, frequency, duration, position)',
    )
    .order('issued_at', { ascending: false });

  if (childFilter) q = q.eq('child_id', childFilter);

  const { data, error } = await q.returns<PrescriptionRow[]>();

  const childName = data?.find((p) => p.children?.id === childFilter)?.children?.name;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-12">
      {issued && (
        <Suspense>
          <FlashToast param="issued" message="Prescription issued — the parent can now see it in the app" />
        </Suspense>
      )}
      <header className="mb-10 flex items-end justify-between gap-6 fade-up">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
            {childName ? 'For patient' : 'Records'}
          </div>
          <h1 className="mt-2 font-display text-[40px] leading-tight text-[var(--ink)]">
            {childName ? `${childName}'s Prescriptions` : 'All Prescriptions'}
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
        <div className="rounded-xl border border-[var(--hairline-strong)] border-l-2 border-l-[var(--ink)] px-5 py-4 font-mono text-[13px] text-[var(--ink)]">
          {error.message}
        </div>
      )}

      {!error && (!data || data.length === 0) && (
        <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] bg-[var(--card)] py-20 text-center">
          <p className="font-display text-[20px] text-[var(--ink-2)]">Nothing issued yet</p>
          <p className="mt-2 text-[14px] text-[var(--ink-3)]">
            Prescriptions you issue will appear here.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <ol className="space-y-10">
          {data.map((p, idx) => {
            const items = [...p.prescription_items].sort((a, b) => a.position - b.position);
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
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--hairline)] pb-3">
                    {!childFilter && (
                      <div>
                        <div className="font-display-italic text-[24px] text-[var(--ink)]">
                          {p.children?.name ?? 'Unknown'}
                        </div>
                        {/* Age + parent tell two children with the same name apart. */}
                        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                          {[
                            p.children?.dob ? computeAge(p.children.dob) : null,
                            p.children?.parents?.name ? `Parent: ${p.children.parents.name}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Details not available'}
                        </div>
                      </div>
                    )}
                    <div className="flex items-baseline gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                      <span>{formatDateTime(p.issued_at)}</span>
                      {p.appointment_id ? (
                        <Link href={`/consultations/${p.appointment_id}`} className="link-underline text-[var(--ink-2)]">
                          View visit →
                        </Link>
                      ) : (
                        <span className="text-[var(--ink-4)]">No linked visit</span>
                      )}
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
