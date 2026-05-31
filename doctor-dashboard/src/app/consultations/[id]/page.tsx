import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type AppointmentRow = {
  id: string;
  date: string;
  time: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  ai_summary_id: string | null;
  meet_link: string | null;
  children: { id: string; name: string; dob: string; sex: string; weight: number | null; height: number | null; blood_group: string | null } | null;
  parents: { name: string | null; phone: string | null } | null;
  doctors: { default_meet_link: string | null } | null;
};

type AllergyRow = { id: string; name: string; severity: string; type: string };
type ConditionRow = { id: string; name: string; details: string | null };
type MedicationRow = { id: string; name: string; dosage: string | null; frequency: string | null };
type GrowthRow = { id: string; weight: number | null; height: number | null; measured_at: string };
type VaccinationRow = { id: string; vaccine_name: string; dose_label: string; scheduled_date: string; administered_date: string | null; status: string };
type CheckinSummary = {
  chiefComplaint: string;
  details: { label: string; value: string }[];
  relevantHistory: string | null;
  allergyNote: string | null;
  suggestedUrgency: 'routine' | 'soon' | 'urgent';
};
type CheckinSession = { id: string; ai_summary: CheckinSummary | null; initial_complaint: string };

function computeAge(dob: string) {
  const d = new Date(dob);
  const now = new Date();
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (months < 24) return `${months} mo`;
  const y = Math.floor(months / 12);
  const r = months % 12;
  return r === 0 ? `${y} yr` : `${y} yr · ${r} mo`;
}

function formatStamp(date: string, time: string) {
  const d = new Date(`${date}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: d.toLocaleDateString('en-US', { day: '2-digit' }),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    time: time.slice(0, 5),
  };
}

export default async function ConsultationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: appointment } = await supabase
    .from('appointments')
    .select(
      'id, date, time, status, ai_summary_id, meet_link, ' +
        'children(id, name, dob, sex, weight, height, blood_group), ' +
        'parents(name, phone), ' +
        'doctors(default_meet_link)',
    )
    .eq('id', id)
    .maybeSingle<AppointmentRow>();

  if (!appointment || !appointment.children) notFound();
  const child = appointment.children;
  const stamp = formatStamp(appointment.date, appointment.time);
  const age = computeAge(child.dob);

  // Parallel fetches now that the doctor has SELECT policies (migration 0009)
  const [
    { data: allergies },
    { data: conditions },
    { data: medications },
    { data: growth },
    { data: vaccinations },
    { data: checkin },
  ] = await Promise.all([
    supabase.from('allergies').select('id, name, severity, type').eq('child_id', child.id).returns<AllergyRow[]>(),
    supabase.from('conditions').select('id, name, details').eq('child_id', child.id).returns<ConditionRow[]>(),
    supabase.from('medications').select('id, name, dosage, frequency').eq('child_id', child.id).returns<MedicationRow[]>(),
    supabase.from('growth_measurements').select('id, weight, height, measured_at').eq('child_id', child.id).order('measured_at', { ascending: false }).limit(5).returns<GrowthRow[]>(),
    supabase.from('vaccinations').select('id, vaccine_name, dose_label, scheduled_date, administered_date, status').eq('child_id', child.id).order('scheduled_date', { ascending: true }).returns<VaccinationRow[]>(),
    appointment.ai_summary_id
      ? supabase.from('checkin_sessions').select('id, ai_summary, initial_complaint').eq('id', appointment.ai_summary_id).maybeSingle<CheckinSession>()
      : Promise.resolve({ data: null }),
  ]);

  const overdueVaccines = (vaccinations ?? []).filter((v) => v.status === 'overdue');
  const doneVaccines = (vaccinations ?? []).filter((v) => v.status === 'done');
  const upcomingVaccines = (vaccinations ?? []).filter((v) => v.status === 'upcoming' || v.status === 'due_soon');
  const latestWeight = child.weight ?? growth?.[0]?.weight ?? null;
  const latestHeight = child.height ?? growth?.[0]?.height ?? null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-12">
      {/* Editorial header */}
      <header className="mb-10 fade-up">
        <Link href="/" className="link-underline font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
          ← back to queue
        </Link>
        <div className="mt-6 grid grid-cols-[6rem_1fr_auto] items-baseline gap-6 border-b border-[var(--hairline)] pb-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
              {stamp.weekday} {stamp.month}
            </div>
            <div className="font-display text-[44px] leading-[1] text-[var(--ink)]">{stamp.day}</div>
            <div className="mt-1 font-mono text-[12px] tracking-[0.1em] text-[var(--ink-2)]">{stamp.time}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">Patient</div>
            <h1 className="mt-2 font-display-italic text-[44px] leading-none text-[var(--ink)]">{child.name}</h1>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
              {age} · {child.sex} · parent {appointment.parents?.name ?? appointment.parents?.phone ?? '—'}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`font-mono text-[10px] uppercase tracking-[0.18em] ${appointment.status === 'upcoming' ? 'text-[var(--accent)]' : 'text-[var(--ink-3)]'}`}>
              · {appointment.status}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {(() => {
            // Prefer the per-appointment Calendar-event Meet link;
            // fall back to the doctor's permanent room.
            const meet = appointment.meet_link ?? appointment.doctors?.default_meet_link;
            return meet ? (
              <a href={meet} target="_blank" rel="noreferrer" className="editorial-btn">
                Start video
              </a>
            ) : (
              <Link href="/settings" className="editorial-btn-ghost">
                Set video link in Settings
              </Link>
            );
          })()}
          <Link href={`/conversations?child=${child.id}`} className="editorial-btn-ghost">
            Open chat
          </Link>
          <Link
            href={`/prescriptions?child=${child.id}`}
            className="editorial-btn-ghost"
          >
            Prescriptions
          </Link>
          <Link
            href={`/prescriptions/new?child=${child.id}&appointment=${appointment.id}`}
            className="editorial-btn-ghost"
          >
            Issue prescription
          </Link>
        </div>
      </header>

      {/* AI summary */}
      {checkin?.ai_summary && (
        <Section title="AI pre-visit summary" eyebrow="Generated">
          <div className="border-l-2 border-[var(--accent)] pl-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
              Chief complaint · urgency {checkin.ai_summary.suggestedUrgency}
            </div>
            <p className="mt-2 font-display text-[22px] leading-[1.25] text-[var(--ink)]">
              {checkin.ai_summary.chiefComplaint}
            </p>
            {checkin.ai_summary.allergyNote && (
              <p className="mt-3 border-l-2 border-[var(--alert)] bg-[var(--card-overlay)] py-2 pl-3 font-display-italic text-[14px] text-[var(--alert)]">
                ⚠ {checkin.ai_summary.allergyNote}
              </p>
            )}
            {checkin.ai_summary.relevantHistory && (
              <p className="mt-3 font-display-italic text-[14px] text-[var(--ink-2)]">
                Relevant history: {checkin.ai_summary.relevantHistory}
              </p>
            )}
          </div>
          <dl className="mt-5 space-y-3 border-t border-[var(--hairline)] pt-4">
            {checkin.ai_summary.details.map((d, i) => (
              <div key={i} className="grid grid-cols-[10rem_1fr] gap-4">
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">{d.label}</dt>
                <dd className="font-sans text-[14px] leading-[1.55] text-[var(--ink)]">{d.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {/* Vitals + flags row */}
      <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-2">
        <Section title="Vitals" eyebrow="Measurements">
          <div className="grid grid-cols-3 gap-6">
            <Vital label="Weight" value={latestWeight ? `${latestWeight} kg` : '—'} />
            <Vital label="Height" value={latestHeight ? `${latestHeight} cm` : '—'} />
            <Vital label="Blood gp" value={child.blood_group ?? '—'} />
          </div>
          {growth && growth.length > 0 && (
            <ul className="mt-5 space-y-1.5 border-t border-[var(--hairline)] pt-3">
              {growth.map((g) => (
                <li key={g.id} className="grid grid-cols-[7rem_1fr] gap-4 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                  <span>{g.measured_at}</span>
                  <span className="lowercase tracking-normal text-[var(--ink-2)]">
                    {g.weight ? `${g.weight} kg` : '—'} · {g.height ? `${g.height} cm` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Clinical flags" eyebrow="Profile">
          {!allergies?.length && !conditions?.length && !medications?.length ? (
            <p className="font-display-italic text-[16px] text-[var(--ink-3)]">No flags on file.</p>
          ) : (
            <>
              {allergies && allergies.length > 0 && (
                <FlagBlock label="Allergies" color="alert">
                  <ul className="space-y-1">
                    {allergies.map((a) => (
                      <li key={a.id} className="font-sans text-[14px]">
                        {a.name}{' '}
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                          · {a.severity} · {a.type}
                        </span>
                      </li>
                    ))}
                  </ul>
                </FlagBlock>
              )}
              {conditions && conditions.length > 0 && (
                <FlagBlock label="Chronic conditions">
                  <ul className="space-y-1">
                    {conditions.map((c) => (
                      <li key={c.id} className="font-sans text-[14px]">
                        {c.name}
                        {c.details && <span className="text-[var(--ink-3)]"> — {c.details}</span>}
                      </li>
                    ))}
                  </ul>
                </FlagBlock>
              )}
              {medications && medications.length > 0 && (
                <FlagBlock label="Current medications">
                  <ul className="space-y-1">
                    {medications.map((m) => (
                      <li key={m.id} className="font-sans text-[14px]">
                        {m.name}
                        {m.dosage && <span className="text-[var(--ink-3)]"> · {m.dosage}</span>}
                        {m.frequency && <span className="text-[var(--ink-3)]"> · {m.frequency}</span>}
                      </li>
                    ))}
                  </ul>
                </FlagBlock>
              )}
            </>
          )}
        </Section>
      </div>

      {/* Vaccinations */}
      <Section title="Immunisation" eyebrow="Schedule" className="mt-10">
        <div className="mb-4 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="text-[var(--accent)]">{doneVaccines.length} done</span>
          <span className="text-[var(--ink-3)]">·</span>
          <span className="text-[var(--alert)]">{overdueVaccines.length} overdue</span>
          <span className="text-[var(--ink-3)]">·</span>
          <span className="text-[var(--ink-2)]">{upcomingVaccines.length} upcoming</span>
        </div>
        {overdueVaccines.length > 0 && (
          <div className="mb-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--alert)]">Overdue</div>
            <ul className="mt-2 space-y-1">
              {overdueVaccines.slice(0, 8).map((v) => (
                <li key={v.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-[var(--hairline)] py-2 text-[14px]">
                  <span>{v.vaccine_name} <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">· {v.dose_label}</span></span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--alert)]">{v.scheduled_date}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {upcomingVaccines.length > 0 && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Upcoming</div>
            <ul className="mt-2 space-y-1">
              {upcomingVaccines.slice(0, 5).map((v) => (
                <li key={v.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-[var(--hairline)] py-2 text-[14px]">
                  <span>{v.vaccine_name} <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">· {v.dose_label}</span></span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-2)]">{v.scheduled_date}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </main>
  );
}

function Section({
  title,
  eyebrow,
  className,
  children,
}: {
  title: string;
  eyebrow?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`fade-up ${className ?? ''}`}>
      {eyebrow && (
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">{eyebrow}</div>
      )}
      <h2 className="mb-5 mt-1 font-display text-[26px] leading-none tracking-[-0.02em] text-[var(--ink)]">
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">{label}</div>
      <div className="mt-1 font-display text-[28px] leading-none text-[var(--ink)]">{value}</div>
    </div>
  );
}

function FlagBlock({
  label,
  color,
  children,
}: {
  label: string;
  color?: 'alert';
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 border-l-2 pl-4" style={{ borderColor: color === 'alert' ? 'var(--alert)' : 'var(--accent)' }}>
      <div
        className="font-mono text-[10px] uppercase tracking-[0.18em]"
        style={{ color: color === 'alert' ? 'var(--alert)' : 'var(--ink-3)' }}
      >
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
