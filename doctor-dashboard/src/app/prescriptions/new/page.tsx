import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PrescriptionForm } from './prescription-form';

export default async function NewPrescriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string; appointment?: string }>;
}) {
  const { child: childId, appointment: appointmentId } = await searchParams;
  if (!childId) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: child } = await supabase
    .from('children')
    .select('id, name')
    .eq('id', childId)
    .maybeSingle<{ id: string; name: string }>();

  if (!child) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-16">
      <header className="mb-12 fade-up">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          New entry
        </div>
        <h1 className="mt-4 font-display text-[56px] leading-[0.95] tracking-[-0.03em] text-[var(--ink)]">
          A prescription <br />
          for <span className="font-display-italic">{child.name}</span>
        </h1>
      </header>

      <PrescriptionForm
        childId={child.id}
        childName={child.name}
        appointmentId={appointmentId ?? null}
      />
    </main>
  );
}
