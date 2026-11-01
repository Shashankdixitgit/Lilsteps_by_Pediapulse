import Link from 'next/link';
import { Suspense } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { FlashToast } from '../flash-toast';
import { PrescriptionCard, type PrescriptionCardData } from './prescription-card';

type PrescriptionRow = PrescriptionCardData & {
  child_id: string;
  children: { id: string; name: string; dob: string | null; parents: { name: string | null } | null } | null;
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
      'id, issued_at, notes, child_id, appointment_id, doctor_name, qualifications, registration_number, appointments(date, time), children(id, name, dob, parents(name)), prescription_items(id, medicine, dose, frequency, duration, notes, position)',
    )
    .order('issued_at', { ascending: false });

  if (childFilter) q = q.eq('child_id', childFilter);

  const { data, error } = await q.returns<PrescriptionRow[]>();

  // From the child row, so the heading is right even before anything is issued.
  const { data: filteredChild } = childFilter
    ? await supabase.from('children').select('name').eq('id', childFilter).maybeSingle<{ name: string }>()
    : { data: null };
  const childName = filteredChild?.name ?? data?.find((p) => p.children?.id === childFilter)?.children?.name;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-8">
      {issued && (
        <Suspense>
          <FlashToast param="issued" message="Prescription issued — the parent can now see it in the app" />
        </Suspense>
      )}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 fade-up">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
            {childName ? 'For patient' : 'Records'}
          </div>
          <h1 className="mt-2 font-display text-[32px] leading-tight sm:text-[40px] text-[var(--ink)]">
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
        <ol className="space-y-6">
          {data.map((p, idx) => (
            <li key={p.id} className="fade-up" style={{ animationDelay: `${Math.min(idx, 10) * 40}ms` }}>
              <PrescriptionCard
                rx={p}
                child={p.children ? { name: p.children.name, dob: p.children.dob } : null}
                parentName={p.children?.parents?.name}
              />
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
