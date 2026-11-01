import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchAllergiesNotKnown, noAllergiesLabel } from '@/lib/appointments';
import { severityLabel } from '@/lib/consultations';
import { computeAge, formatDate, formatDateTime, todayIst } from '@/lib/format';
import { SAVED_MEDICINE_COLUMNS, toSavedMedicine, type SavedMedicineRow } from '@/lib/saved-medicines';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PrescriptionForm } from './prescription-form';

type ChildRow = { id: string; name: string; dob: string; sex: string | null; weight: number | null };
type AllergyRow = { id: string; name: string; severity: string; type: string };
type ConditionRow = { id: string; name: string; details: string | null };
type MedicationRow = { id: string; name: string; dosage: string | null; frequency: string | null };
type GrowthRow = { weight: number | null; measured_at: string };
type ExistingRx = { id: string; issued_at: string; prescription_items: { medicine: string; position: number }[] };
type DoctorRow = { name: string; qualifications: string | null; registration_number: string | null };

const SEX_LABEL: Record<string, string> = { male: 'Male', female: 'Female', other: 'Other' };

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
    .select('id, name, dob, sex, weight')
    .eq('id', childId)
    .maybeSingle<ChildRow>();

  if (!child) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: doctorAuth } = user
    ? await supabase.from('doctor_auth').select('doctor_id').eq('id', user.id).maybeSingle<{ doctor_id: string }>()
    : { data: null };

  // A prescription may only attach to this doctor's own upcoming or completed
  // visit for this child (create_prescription refuses anything else, 0050).
  if (appointmentId) {
    const { data: ownVisit } = doctorAuth
      ? await supabase
          .from('appointments')
          .select('id')
          .eq('id', appointmentId)
          .eq('doctor_id', doctorAuth.doctor_id)
          .eq('child_id', child.id)
          .in('status', ['upcoming', 'completed'])
          .maybeSingle<{ id: string }>()
      : { data: null };
    if (!ownVisit) notFound();
  }

  // Dose depends on weight and must respect allergies — show both next to the form.
  const [
    { data: allergies },
    { data: conditions },
    { data: medications },
    { data: growth },
    allergiesNotKnown,
    { data: existing },
    { data: doctorRow },
    { data: savedRows, error: savedError },
  ] = await Promise.all([
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
    // Printed in the footer; create_prescription snapshots the same row (0050).
    doctorAuth
      ? supabase
          .from('doctors')
          .select('name, qualifications, registration_number')
          .eq('id', doctorAuth.doctor_id)
          .maybeSingle<DoctorRow>()
      : Promise.resolve({ data: null as DoctorRow | null }),
    // The doctor's own saved medicines (RLS: own rows only, 0055).
    supabase
      .from('doctor_saved_medicines')
      .select(SAVED_MEDICINE_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(200)
      .returns<SavedMedicineRow[]>(),
  ]);
  const alreadyIssued = existing ?? [];

  // The prescription must carry the doctor's registration number; the action
  // refuses without it, so warn before the doctor fills anything in.
  const registrationMissing = !doctorRow?.registration_number?.trim();

  const latest = growth?.[0];
  const weight = latest?.weight ?? child.weight;
  const weightNote = latest ? `measured ${formatDate(latest.measured_at)}` : child.weight ? 'from profile' : null;
  const hasAllergies = Boolean(allergies?.length);

  const patientHeader = (
    <section
      aria-label="Patient"
      className="overflow-hidden rounded-2xl border border-[var(--hairline-strong)] bg-[var(--card)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--hairline)] bg-[var(--paper-soft)] px-5 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">Patient</span>
        <span className="text-[12px] text-[var(--ink-3)]">From {child.name.split(' ')[0]}&apos;s record · read only</span>
      </div>
      <div className="px-5 py-4">
        <div className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ink)]">{child.name}</div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact label="Sex" value={(child.sex && SEX_LABEL[child.sex]) || '—'} />
          <Fact label="Date of birth" value={formatDate(child.dob)} />
          <Fact label="Age" value={computeAge(child.dob)} />
          <Fact
            label="Weight"
            value={weight ? `${weight} kg` : 'Not recorded'}
            note={weightNote ?? 'ask the parent'}
            strong={Boolean(weight)}
          />
        </dl>
      </div>

      {/* Allergies: the first thing to see before prescribing. */}
      <div
        role={hasAllergies || allergiesNotKnown ? 'note' : undefined}
        className={`border-t px-5 py-3 ${hasAllergies || allergiesNotKnown ? 'border-l-[4px] bg-[var(--peach)]' : ''}`}
        // Inline: globals.css sets border-color on * outside any layer, so colour utilities lose.
        style={hasAllergies || allergiesNotKnown ? { borderColor: 'var(--alert)' } : undefined}
      >
        <div
          className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${
            hasAllergies || allergiesNotKnown ? 'text-[var(--alert)]' : 'text-[var(--ink-3)]'
          }`}
        >
          {hasAllergies ? '⚠ Allergies' : 'Allergies'}
        </div>
        {hasAllergies ? (
          <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {allergies!.map((a) => (
              <li key={a.id} className="text-[15px] font-semibold text-[var(--ink)]">
                {a.name}{' '}
                <span className="text-[12px] font-normal text-[var(--ink-2)]">
                  · {severityLabel(a.severity)} · {a.type}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`mt-1 text-[14px] ${allergiesNotKnown ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
            {allergiesNotKnown ? `⚠ ${noAllergiesLabel(true)}.` : noAllergiesLabel(false, 'No known allergies')}
          </p>
        )}
      </div>

      <div className="border-t border-[var(--hairline)] px-5 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
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
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-8">
      <header className="mb-8 fade-up">
        {appointmentId && (
          <Link
            href={`/consultations/${appointmentId}`}
            className="link-underline text-[13px] font-medium text-[var(--ink-3)] hover:text-[var(--ink)]"
          >
            ← Back to consultation
          </Link>
        )}
        <div className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">New prescription</div>
        <h1 className="mt-2 font-display text-[32px] leading-tight text-[var(--ink)] sm:text-[40px]">
          Prescription for {child.name}
        </h1>
      </header>

      {registrationMissing && (
        <div
          role="alert"
          className="mb-8 rounded-xl border border-[var(--hairline-strong)] border-l-[3px] bg-[var(--paper-soft)] px-5 py-4 text-[14px] leading-[1.55] text-[var(--ink)] fade-up"
          style={{ borderLeftColor: 'var(--alert)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--alert)]">
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
          className="mb-8 rounded-xl border border-[var(--hairline-strong)] border-l-[3px] bg-[var(--paper-soft)] px-5 py-4 text-[14px] leading-[1.55] text-[var(--ink)] fade-up"
          style={{ borderLeftColor: 'var(--ink)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em]">⚠ Already issued for this visit</div>
          <ul className="mt-2 space-y-1">
            {alreadyIssued.map((p) => (
              <li key={p.id}>
                <span className="font-mono text-[12px] text-[var(--ink-3)]">{formatDateTime(p.issued_at)} · </span>
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
        patientHeader={patientHeader}
        existingCount={alreadyIssued.length}
        registrationMissing={registrationMissing}
        childId={child.id}
        child={{ name: child.name, dob: child.dob }}
        weightKg={weight ? Number(weight) : null}
        appointmentId={appointmentId ?? null}
        allergies={(allergies ?? []).map((a) => ({ name: a.name, severity: a.severity, type: a.type }))}
        allergiesNotKnown={!hasAllergies && allergiesNotKnown}
        doctor={{
          name: doctorRow?.name ?? 'Doctor',
          qualifications: doctorRow?.qualifications?.trim() || null,
          registrationNumber: doctorRow?.registration_number?.trim() || null,
        }}
        today={todayIst()}
        now={new Date().toISOString()}
        // Before 0055 is applied the table does not exist: hide the panel rather than fail the page.
        savedMedicines={savedError ? null : (savedRows ?? []).map(toSavedMedicine)}
      />
    </main>
  );
}

function Fact({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">{label}</dt>
      <dd className={`mt-0.5 font-mono text-[16px] ${strong ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink)]'}`}>{value}</dd>
      {note && <dd className="text-[12px] text-[var(--ink-3)]">{note}</dd>}
    </div>
  );
}
