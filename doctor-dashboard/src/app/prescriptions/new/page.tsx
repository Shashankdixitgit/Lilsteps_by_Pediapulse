import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchAllergiesNotKnown, noAllergiesLabel } from '@/lib/appointments';
import { severityLabel } from '@/lib/consultations';
import { computeAge, formatDate, formatDateTime } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PrescriptionForm } from './prescription-form';

type ChildRow = { id: string; name: string; dob: string; weight: number | null };
type AllergyRow = { id: string; name: string; severity: string; type: string };
type ConditionRow = { id: string; name: string; details: string | null };
type MedicationRow = { id: string; name: string; dosage: string | null; frequency: string | null };
type GrowthRow = { weight: number | null; measured_at: string };
type ExistingRx = { id: string; issued_at: string; prescription_items: { medicine: string; position: number }[] };

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
    .select('id, name, dob, weight')
    .eq('id', childId)
    .maybeSingle<ChildRow>();

  if (!child) notFound();

  // Dose depends on weight and must respect allergies — show both next to the form.
  const [{ data: allergies }, { data: conditions }, { data: medications }, { data: growth }, allergiesNotKnown, { data: existing }] =
    await Promise.all([
      supabase.from('allergies').select('id, name, severity, type').eq('child_id', child.id).returns<AllergyRow[]>(),
      supabase.from('conditions').select('id, name, details').eq('child_id', child.id).returns<ConditionRow[]>(),
      supabase.from('medications').select('id, name, dosage, frequency').eq('child_id', child.id).returns<MedicationRow[]>(),
      supabase
        .from('growth_measurements')
        .select('weight, measured_at')
        .eq('child_id', child.id)
        .not('weight', 'is', null)
        .order('measured_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .returns<GrowthRow[]>(),
      fetchAllergiesNotKnown(supabase, child.id),
      // Prescriptions already issued for this visit: warn before a second one.
      appointmentId
        ? supabase
            .from('prescriptions')
            .select('id, issued_at, prescription_items(medicine, position)')
            .eq('appointment_id', appointmentId)
            .order('issued_at', { ascending: true })
            .returns<ExistingRx[]>()
        : Promise.resolve({ data: [] as ExistingRx[] }),
    ]);
  const alreadyIssued = existing ?? [];

  // The prescription must carry the doctor's registration number; the action
  // refuses without it, so warn before the doctor fills anything in.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: doctorAuth } = user
    ? await supabase.from('doctor_auth').select('doctor_id').eq('id', user.id).maybeSingle<{ doctor_id: string }>()
    : { data: null };
  const { data: doctorRow } = doctorAuth
    ? await supabase
        .from('doctors')
        .select('registration_number')
        .eq('id', doctorAuth.doctor_id)
        .maybeSingle<{ registration_number: string | null }>()
    : { data: null };
  const registrationMissing = !doctorRow?.registration_number?.trim();

  const latest = growth?.[0];
  const weight = latest?.weight ?? child.weight;
  const weightNote = latest ? `measured ${formatDate(latest.measured_at)}` : child.weight ? 'from profile' : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-16">
      <header className="mb-10 fade-up">
        {appointmentId && (
          <Link
            href={`/consultations/${appointmentId}`}
            className="link-underline font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-3)]"
          >
            ← back to consultation
          </Link>
        )}
        <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          New entry
        </div>
        <h1 className="mt-4 font-display text-[56px] leading-[0.95] tracking-[-0.03em] text-[var(--ink)]">
          A prescription <br />
          for <span className="font-display-italic">{child.name}</span>
        </h1>
      </header>

      {/* Clinical context for dosing */}
      <section
        aria-label="Patient details for dosing"
        className="mb-12 grid grid-cols-1 gap-6 border-y border-[var(--hairline)] py-6 fade-up sm:grid-cols-[9rem_1fr_1fr]"
      >
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Weight</div>
          <div className="mt-1 font-display text-[28px] leading-none text-[var(--ink)]">
            {weight ? `${weight} kg` : '—'}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
            {computeAge(child.dob)}
            {weightNote ? ` · ${weightNote}` : ' · not recorded'}
          </div>
        </div>
        <div className={allergies?.length ? 'border-l-[3px] border-[var(--ink)] pl-4' : 'pl-4'}>
          <div
            className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
              allergies?.length ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-3)]'
            }`}
          >
            Allergies
          </div>
          {allergies && allergies.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {allergies.map((a) => (
                <li key={a.id} className="text-[14px] font-semibold text-[var(--ink)]">
                  ⚠ {a.name}{' '}
                  <span className="font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-[var(--ink-3)]">
                    · {severityLabel(a.severity)} · {a.type}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`mt-1 text-[14px] ${allergiesNotKnown ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}>
              {allergiesNotKnown ? `⚠ ${noAllergiesLabel(true)}.` : noAllergiesLabel(false)}
            </p>
          )}
        </div>
        <div className="pl-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
            Conditions &amp; current medicines
          </div>
          {!conditions?.length && !medications?.length ? (
            <p className="mt-1 text-[14px] text-[var(--ink-3)]">None recorded</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-[14px] text-[var(--ink)]">
              {(conditions ?? []).map((c) => (
                <li key={c.id}>
                  {c.name}
                  {c.details && <span className="text-[var(--ink-3)]"> — {c.details}</span>}
                </li>
              ))}
              {(medications ?? []).map((m) => (
                <li key={m.id}>
                  {m.name}
                  {m.dosage && <span className="text-[var(--ink-3)]"> · {m.dosage}</span>}
                  {m.frequency && <span className="text-[var(--ink-3)]"> · {m.frequency}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {registrationMissing && (
        <div
          role="alert"
          className="mb-12 border-l-[3px] border-[var(--alert)] bg-[var(--paper-soft)] px-5 py-4 text-[14px] leading-[1.55] text-[var(--ink)] fade-up"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--alert)]">
            ⚠ Registration number missing
          </div>
          <p className="mt-2">
            Every prescription must show your medical council registration number. You can&apos;t issue this one
            until you add it.{' '}
            <Link href="/settings" className="link-underline font-semibold">
              Add it in Settings
            </Link>
            , then come back to this page.
          </p>
        </div>
      )}

      {alreadyIssued.length > 0 && (
        <div
          role="note"
          className="mb-12 border-l-[3px] border-[var(--ink)] bg-[var(--paper-soft)] px-5 py-4 text-[14px] leading-[1.55] text-[var(--ink)] fade-up"
        >
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
            ⚠ Already issued for this visit
          </div>
          <ul className="mt-2 space-y-1">
            {alreadyIssued.map((p) => (
              <li key={p.id}>
                <span className="font-mono text-[11px] text-[var(--ink-3)]">{formatDateTime(p.issued_at)} · </span>
                {[...p.prescription_items]
                  .sort((a, b) => a.position - b.position)
                  .map((it) => it.medicine)
                  .join(', ') || 'No medicines'}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-[var(--ink-3)]">
            A new prescription is added alongside, it does not replace these. Issue another only if you mean to.
          </p>
        </div>
      )}

      <PrescriptionForm
        existingCount={alreadyIssued.length}
        registrationMissing={registrationMissing}
        childId={child.id}
        childName={child.name}
        appointmentId={appointmentId ?? null}
        allergies={(allergies ?? []).map((a) => ({ name: a.name, severity: a.severity, type: a.type }))}
        allergiesNotKnown={!allergies?.length && allergiesNotKnown}
      />
    </main>
  );
}
