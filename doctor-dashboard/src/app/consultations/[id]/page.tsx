import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { fetchAllergiesNotKnown, fetchConcerns, noAllergiesLabel } from '@/lib/appointments';
import { parseVisitNotes, severityLabel } from '@/lib/consultations';
import { getCurrentDoctor, hasVideoLink } from '@/lib/doctor';
import { computeAge, dateStamp, formatClock, formatDate, formatDateTime, formatSlotTime, nowIstTime, todayIst } from '@/lib/format';
import { parentContact } from '@/lib/parent';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { vaccineBucket } from '@/lib/vaccines';
import { FlashToast } from '../../flash-toast';
import { LateBadge, UrgencyBadge } from '../../urgency-badge';
import { VideoLinkBanner } from '../../video-link-banner';
import { OnboardingAnswersList, onboardingAnswersEyebrow, type OnboardingAnswers } from './onboarding-answers';
import { OpenChatButton } from './open-chat-button';
import { VisitNotesForm } from './visit-notes';

type AppointmentRow = {
  id: string;
  date: string;
  time: string;
  status: 'upcoming' | 'completed' | 'cancelled' | 'no_show';
  ai_summary_id: string | null;
  meet_link: string | null;
  children: { id: string; name: string; dob: string; sex: string; weight: number | null; height: number | null; blood_group: string | null; onboarding_answers: OnboardingAnswers } | null;
  parents: { name: string | null; phone: string | null } | null;
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

type CheckinMessageRow = { id: string; role: string; content: string; created_at: string };

type PrescriptionRow = {
  id: string;
  issued_at: string;
  notes: string | null;
  prescription_items: { id: string; medicine: string; dose: string; frequency: string; duration: string | null; position: number }[];
};

type HealthNoteRow = {
  id: string;
  category: string;
  content: string;
  severity: number | null;
  noted_at: string;
};

const NOTE_CATEGORY: Record<string, string> = {
  symptom: 'Symptom',
  behaviour: 'Behaviour',
  sleep: 'Sleep',
  feeding: 'Feeding',
  medication: 'Medication',
  other: 'Other',
};

// The parent's health log can grow long; the consult page shows the latest few.
const HEALTH_NOTES_LIMIT = 10;

type DocumentRow = {
  id: string;
  title: string;
  category: string;
  file_type: string;
  document_date: string;
  doctor_name: string | null;
  notes: string | null;
};

const DOC_CATEGORY: Record<string, string> = {
  prescription: 'Prescription',
  report: 'Report',
  lab_test: 'Lab test',
  visit_history: 'Visit history',
  vaccination: 'Vaccination',
  other: 'Other',
};

// Upcoming doses listed before the rest fold under "Show more".
const UPCOMING_PREVIEW = 6;

const URGENCY_LABEL: Record<string, string> = {
  routine: 'routine',
  soon: 'see in 1–2 days',
  urgent: 'urgent · see today',
};

const STATUS_LABEL: Record<AppointmentRow['status'], string> = {
  upcoming: 'Upcoming',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export default async function ConsultationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ issued?: string }>;
}) {
  const { id } = await params;
  const { issued } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const doctor = await getCurrentDoctor(supabase);

  const { data: appointment } = await supabase
    .from('appointments')
    .select(
      'id, date, time, status, ai_summary_id, meet_link, ' +
        'children(id, name, dob, sex, weight, height, blood_group, onboarding_answers), ' +
        'parents(name, phone)',
    )
    .eq('id', id)
    .maybeSingle<AppointmentRow>();

  if (!appointment || !appointment.children) notFound();
  const child = appointment.children;
  const stamp = { ...dateStamp(appointment.date), time: formatSlotTime(appointment.time) };
  const age = computeAge(child.dob);
  const isLate = appointment.status === 'upcoming' && appointment.date === todayIst() && appointment.time <= nowIstTime();

  // Parallel fetches now that the doctor has SELECT policies (migration 0009)
  const [
    { data: allergies },
    { data: conditions },
    { data: medications },
    { data: growth },
    { data: vaccinations },
    { data: checkin },
    { data: documents, error: documentsError },
    { data: consultation },
    concerns,
    { data: healthNotes, error: healthNotesError },
    allergiesNotKnown,
    { data: visitRx },
    { data: checkinMessages },
  ] = await Promise.all([
    supabase.from('allergies').select('id, name, severity, type').eq('child_id', child.id).returns<AllergyRow[]>(),
    supabase.from('conditions').select('id, name, details').eq('child_id', child.id).returns<ConditionRow[]>(),
    supabase.from('medications').select('id, name, dosage, frequency').eq('child_id', child.id).returns<MedicationRow[]>(),
    supabase.from('growth_measurements').select('id, weight, height, measured_at').eq('child_id', child.id).order('measured_at', { ascending: false }).order('created_at', { ascending: false }).limit(5).returns<GrowthRow[]>(),
    supabase.from('vaccinations').select('id, vaccine_name, dose_label, scheduled_date, administered_date, status').eq('child_id', child.id).order('scheduled_date', { ascending: true }).returns<VaccinationRow[]>(),
    appointment.ai_summary_id
      ? supabase.from('checkin_sessions').select('id, ai_summary, initial_complaint').eq('id', appointment.ai_summary_id).maybeSingle<CheckinSession>()
      : Promise.resolve({ data: null }),
    supabase.from('documents').select('id, title, category, file_type, document_date, doctor_name, notes').eq('child_id', child.id).order('document_date', { ascending: false }).order('created_at', { ascending: false }).returns<DocumentRow[]>(),
    supabase.from('consultations').select('doctor_notes').eq('appointment_id', appointment.id).maybeSingle<{ doctor_notes: string | null }>(),
    fetchConcerns(supabase, [appointment.id]),
    supabase.from('health_notes').select('id, category, content, severity, noted_at').eq('child_id', child.id).order('noted_at', { ascending: false }).limit(HEALTH_NOTES_LIMIT).returns<HealthNoteRow[]>(),
    fetchAllergiesNotKnown(supabase, child.id),
    supabase.from('prescriptions').select('id, issued_at, notes, prescription_items(id, medicine, dose, frequency, duration, position)').eq('appointment_id', appointment.id).order('issued_at', { ascending: true }).returns<PrescriptionRow[]>(),
    // The full check-in conversation behind the summary. Needs a doctor
    // SELECT policy on checkin_messages; without one this is simply empty.
    appointment.ai_summary_id
      ? supabase.from('checkin_messages').select('id, role, content, created_at').eq('session_id', appointment.ai_summary_id).order('created_at', { ascending: true }).returns<CheckinMessageRow[]>()
      : Promise.resolve({ data: [] as CheckinMessageRow[] }),
  ]);
  const summary = checkin?.ai_summary ?? null;
  const urgency = summary?.suggestedUrgency ?? null;
  const rawConcern = concerns.get(appointment.id) ?? null;
  // A check-in booking stores the AI's chief complaint as the concern; it is
  // already shown in the summary below, so it is not repeated as a quote.
  const concernFromCheckin = !!appointment.ai_summary_id;
  const concern = rawConcern && rawConcern !== summary?.chiefComplaint ? rawConcern : null;
  // The visit is the signed-in doctor's own, so their room is the fallback.
  // Read through getCurrentDoctor, not a doctors() join, so this page keeps
  // working if parents lose read access to doctors.default_meet_link (P1).
  const meetLink = appointment.meet_link ?? doctor?.defaultMeetLink ?? null;
  const showVideoBanner = !meetLink && !hasVideoLink(doctor);

  // Bucketed by date, not the stored snapshot, and the yearly flu shot is
  // never overdue (R2-10): the same view the parent app shows.
  const today = todayIst();
  const byBucket = (b: ReturnType<typeof vaccineBucket>) =>
    (vaccinations ?? []).filter((v) => vaccineBucket(v, today) === b);
  const overdueVaccines = byBucket('overdue');
  const doneVaccines = byBucket('done');
  const upcomingVaccines = byBucket('upcoming');
  const yearlyVaccines = byBucket('yearly');
  // Any status the schedule gains later (e.g. "not sure") still gets listed.
  const otherVaccines = byBucket('other');
  // Latest logged reading wins; children.weight/height is the onboarding value.
  const latestWeight = growth?.find((g) => g.weight)?.weight ?? child.weight ?? null;
  const latestHeight = growth?.find((g) => g.height)?.height ?? child.height ?? null;

  const notesInitial = parseVisitNotes(consultation?.doctor_notes);
  const prescriptions = visitRx ?? [];
  // Oldest first. The app now saves each answer/reply pair 1 ms apart (C1);
  // older pairs share a timestamp, and then the parent's message comes first
  // (same rule as the app's resumed check-in).
  const transcript = [...(checkinMessages ?? [])].sort(
    (a, b) =>
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      a.created_at.localeCompare(b.created_at) ||
      (a.role === 'user' ? 0 : 1) - (b.role === 'user' ? 0 : 1),
  );
  const allVaccines = vaccinations ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-12">
      {issued && (
        <Suspense>
          <FlashToast param="issued" message={`Prescription issued to ${child.name.split(' ')[0]}'s parent`} />
        </Suspense>
      )}
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
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Patient</div>
            <h1 className="mt-2 font-display text-[36px] leading-tight text-[var(--ink)]">{child.name}</h1>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
              {age} · {child.sex} · parent{' '}
              <span className="normal-case tracking-normal">{parentContact(appointment.parents)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                appointment.status === 'upcoming'
                  ? 'border-[var(--ink)] text-[var(--ink)]'
                  : 'border-[var(--hairline-strong)] text-[var(--ink-3)]'
              }`}
            >
              {STATUS_LABEL[appointment.status] ?? appointment.status}
            </span>
            <UrgencyBadge urgency={urgency} />
            {isLate && <LateBadge />}
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-4)]">
              Video · 30 min
            </span>
          </div>
        </div>

        {urgency === 'urgent' && appointment.status === 'upcoming' && (
          <div
            role="note"
            className="mt-6 border-l-[3px] border-[var(--ink)] bg-[var(--paper-soft)] px-5 py-3 text-[14px] leading-[1.55] text-[var(--ink)]"
          >
            <span className="font-semibold">Urgent check-in.</span> The AI check-in flagged this child to be
            seen today. Review the summary below before the call.
          </div>
        )}

        {showVideoBanner && <VideoLinkBanner className="mt-6" />}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {meetLink && (
            // Prefer the per-appointment Calendar-event Meet link;
            // fall back to the doctor's permanent room.
            <a href={meetLink} target="_blank" rel="noreferrer" className="editorial-btn">
              Start video
            </a>
          )}
          <OpenChatButton appointmentId={appointment.id} />
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
            {prescriptions.length > 0 ? 'Issue another prescription' : 'Issue prescription'}
          </Link>
        </div>
      </header>

      {/* appointments.concern (migration 0020): typed by the parent in "Book a
          doctor", or the AI chief complaint when booked from a check-in. */}
      {concern && (
        <Section
          title={concernFromCheckin ? 'Reason (from check-in)' : 'Reason for visit'}
          eyebrow={concernFromCheckin ? 'AI check-in' : 'From the parent'}
        >
          <p className="border-l-2 border-[var(--ink)] pl-5 font-display-italic text-[18px] leading-[1.45] text-[var(--ink)]">
            &ldquo;{concern}&rdquo;
          </p>
        </Section>
      )}

      {/* AI summary */}
      <Section title="AI pre-visit summary" eyebrow={checkin?.ai_summary ? 'Generated' : 'Check-in'} className={concern ? 'mt-10' : ''}>
        {checkin?.ai_summary ? (
          <>
            <div className="border-l-2 border-[var(--accent)] pl-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                Chief complaint · AI-generated · {URGENCY_LABEL[checkin.ai_summary.suggestedUrgency] ?? `urgency ${checkin.ai_summary.suggestedUrgency}`}
              </div>
              <p className="mt-2 font-display text-[22px] leading-[1.25] text-[var(--ink)]">
                {checkin.ai_summary.chiefComplaint}
              </p>
              {checkin.ai_summary.allergyNote && (
                <p className="mt-3 border-l-[3px] border-[var(--ink)] bg-[var(--paper-soft)] py-2 pl-3 text-[14px] font-semibold text-[var(--ink)]">
                  ⚠ {checkin.ai_summary.allergyNote}
                </p>
              )}
              {checkin.ai_summary.relevantHistory && (
                <p className="mt-3 text-[14px] leading-[1.55] text-[var(--ink-2)]">
                  Relevant history: {checkin.ai_summary.relevantHistory}
                </p>
              )}
            </div>
            <dl className="mt-5 space-y-3 border-t border-[var(--hairline)] pt-4">
              {checkin.ai_summary.details.map((d, i) => (
                <div key={i} className="grid grid-cols-[10rem_1fr] gap-4">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">{d.label}</dt>
                  <dd className="font-sans text-[14px] leading-[1.55] text-[var(--ink)]">{cleanSummaryValue(d.value)}</dd>
                </div>
              ))}
            </dl>
            <CheckinTranscript messages={transcript} childFirstName={child.name.split(' ')[0]} />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] bg-[var(--card)] px-6 py-6">
            <p className="font-display text-[18px] text-[var(--ink-2)]">No pre-visit summary</p>
            <p className="mt-1 text-[14px] leading-[1.55] text-[var(--ink-3)]">
              {checkin?.initial_complaint
                ? `The parent started a check-in ("${checkin.initial_complaint}") but no summary was generated.`
                : 'The parent booked without an AI check-in. Ask about symptoms at the start of the call.'}
            </p>
            {transcript.length > 0 && (
              <CheckinTranscript messages={transcript} childFirstName={child.name.split(' ')[0]} />
            )}
          </div>
        )}
      </Section>

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
                  <span>{formatDate(g.measured_at)}</span>
                  <span className="lowercase tracking-normal text-[var(--ink-2)]">
                    {g.weight ? `${g.weight} kg` : '—'} · {g.height ? `${g.height} cm` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Clinical flags" eyebrow="Profile">
          {!allergies?.length && !conditions?.length && !medications?.length && !allergiesNotKnown ? (
            <p className="text-[15px] text-[var(--ink-3)]">No flags on file.</p>
          ) : (
            <>
              {!allergies?.length && allergiesNotKnown && (
                <FlagBlock label="Allergies">
                  <p className="font-sans text-[14px] font-semibold text-[var(--ink)]">
                    ⚠ {noAllergiesLabel(true)}.
                  </p>
                </FlagBlock>
              )}
              {allergies && allergies.length > 0 && (
                <FlagBlock label="Allergies" color="alert">
                  <ul className="space-y-1">
                    {allergies.map((a) => (
                      <li key={a.id} className="font-sans text-[14px]">
                        {a.name}{' '}
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                          · {severityLabel(a.severity)} · {a.type}
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

      {/* Path-specific onboarding answers (C1, children.onboarding_answers) */}
      <Section title="From onboarding" eyebrow={onboardingAnswersEyebrow(child.onboarding_answers)} className="mt-10">
        <OnboardingAnswersList answers={child.onboarding_answers} childFirstName={child.name.split(' ')[0]} />
      </Section>

      {/* Parent's health log (health_notes) */}
      <Section
        title="Health log"
        eyebrow={healthNotes?.length ? `Latest ${healthNotes.length} · from the parent` : 'From the parent'}
        className="mt-10"
      >
        {healthNotesError ? (
          <p className="font-mono text-[12px] text-[var(--ink-3)]">Could not load the health log: {healthNotesError.message}</p>
        ) : !healthNotes || healthNotes.length === 0 ? (
          <p className="text-[15px] text-[var(--ink-3)]">
            The parent hasn&apos;t logged any notes for {child.name.split(' ')[0]}.
          </p>
        ) : (
          <ul className="border-t border-[var(--hairline)]">
            {healthNotes.map((n) => (
              <li key={n.id} className="grid grid-cols-1 gap-1 border-b border-[var(--hairline)] py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  <div>{formatDateTime(n.noted_at)}</div>
                  <div className="mt-0.5 text-[var(--ink-2)]">
                    {NOTE_CATEGORY[n.category] ?? n.category}
                    {n.severity ? ` · severity ${n.severity}/5` : ''}
                  </div>
                </div>
                <p className="whitespace-pre-line break-words text-[14px] leading-[1.55] text-[var(--ink)]">{n.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Health records uploaded by the parent */}
      <Section title="Health records" eyebrow={`${documents?.length ?? 0} on file`} className="mt-10">
        {documentsError ? (
          <p className="font-mono text-[12px] text-[var(--ink-3)]">Could not load records: {documentsError.message}</p>
        ) : !documents || documents.length === 0 ? (
          <p className="text-[15px] text-[var(--ink-3)]">The parent hasn&apos;t uploaded any records for {child.name.split(' ')[0]}.</p>
        ) : (
          <ul className="border-t border-[var(--hairline)]">
            {documents.map((d) => (
              <li key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--hairline)] py-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] text-[var(--ink)]">{d.title}</div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                    {DOC_CATEGORY[d.category] ?? d.category} · {formatDate(d.document_date)} · {d.file_type}
                    {d.doctor_name ? <span className="normal-case tracking-normal"> · {d.doctor_name}</span> : null}
                  </div>
                  {d.notes && <div className="mt-1 truncate text-[13px] text-[var(--ink-3)]">{d.notes}</div>}
                </div>
                <a
                  href={`/records/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link-underline font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink)]"
                >
                  Open ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Prescriptions issued for this appointment */}
      <Section
        title="Prescriptions for this visit"
        eyebrow={prescriptions.length ? `${prescriptions.length} issued` : 'None issued'}
        className="mt-10"
      >
        {prescriptions.length === 0 ? (
          <p className="text-[15px] text-[var(--ink-3)]">No prescription has been issued for this visit yet.</p>
        ) : (
          <ol className="border-t border-[var(--hairline)]">
            {prescriptions.map((p, i) => (
              <li key={p.id} className="border-b border-[var(--hairline)] py-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  ℞ {i + 1} · issued {formatDateTime(p.issued_at)}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {[...p.prescription_items]
                    .sort((a, b) => a.position - b.position)
                    .map((it) => (
                      <li key={it.id} className="text-[14px] text-[var(--ink)]">
                        {it.medicine}
                        <span className="text-[var(--ink-3)]">
                          {' '}· {it.dose} · {it.frequency}
                          {it.duration ? ` · ${it.duration}` : ''}
                        </span>
                      </li>
                    ))}
                </ul>
                {p.notes && <p className="mt-1 text-[13px] text-[var(--ink-3)]">Note: {p.notes}</p>}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Visit notes — writes consultations + appointments.status */}
      <Section
        title="Visit notes"
        eyebrow={appointment.status === 'upcoming' ? 'Close the visit' : STATUS_LABEL[appointment.status] ?? appointment.status}
        className="mt-12 border-y border-[var(--hairline)] py-10"
      >
        <VisitNotesForm
          appointmentId={appointment.id}
          status={appointment.status}
          initial={notesInitial}
          childFirstName={child.name.split(' ')[0]}
          slotDate={appointment.date}
          slotTime={appointment.time}
        />
      </Section>

      {/* Vaccinations */}
      <Section title="Immunisation" eyebrow="Schedule" className="mt-10">
        <div className="mb-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.12em]">
          <span className="rounded-full border border-[var(--hairline-strong)] px-2.5 py-1 text-[var(--ink-3)]">
            {doneVaccines.length} done
          </span>
          <span
            className={`rounded-full px-2.5 py-1 ${
              overdueVaccines.length > 0
                ? 'border border-[var(--ink)] bg-[var(--ink)] font-semibold text-[var(--paper)]'
                : 'border border-[var(--hairline-strong)] text-[var(--ink-4)]'
            }`}
          >
            {overdueVaccines.length} overdue
          </span>
          <span className="rounded-full border border-[var(--hairline-strong)] px-2.5 py-1 text-[var(--ink-2)]">
            {upcomingVaccines.length} upcoming
          </span>
        </div>
        {allVaccines.length === 0 && (
          <p className="text-[15px] text-[var(--ink-3)]">No vaccination schedule on file.</p>
        )}
        {overdueVaccines.length > 0 && (
          <VaccineList label="Overdue" emphasis rows={overdueVaccines} />
        )}
        {upcomingVaccines.length > 0 && (
          <VaccineList label="Upcoming" rows={upcomingVaccines.slice(0, UPCOMING_PREVIEW)} />
        )}
        {upcomingVaccines.length > UPCOMING_PREVIEW && (
          <details className="group mb-5">
            <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)] hover:text-[var(--ink)]">
              <span className="group-open:hidden">Show {upcomingVaccines.length - UPCOMING_PREVIEW} more upcoming ▸</span>
              <span className="hidden group-open:inline">Hide later doses ▾</span>
            </summary>
            <VaccineList label="Later" rows={upcomingVaccines.slice(UPCOMING_PREVIEW)} />
          </details>
        )}
        {yearlyVaccines.length > 0 && (
          <VaccineList label="Yearly · offer each flu season" rows={yearlyVaccines} yearly />
        )}
        {otherVaccines.length > 0 && (
          <VaccineList label="Not sure if given · discuss catch-up" rows={otherVaccines} />
        )}
        {doneVaccines.length > 0 && (
          <details className="group mt-2">
            <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)] hover:text-[var(--ink)]">
              <span className="group-open:hidden">Show {doneVaccines.length} given ▸</span>
              <span className="hidden group-open:inline">Hide given ▾</span>
            </summary>
            <VaccineList label="Given" rows={doneVaccines} given />
          </details>
        )}
      </Section>

    </main>
  );
}

/**
 * Older check-ins saved danger signs with an internal age tag ("Yellow eyes or
 * skin (under 1 month)"); the doctor already sees the child's age.
 */
function cleanSummaryValue(value: string): string {
  return value.replace(/\s*\(under \d+ (?:month|months|days?)\)/gi, '');
}

/** The full AI check-in conversation (checkin_messages), folded away under the summary. */
function CheckinTranscript({ messages, childFirstName }: { messages: CheckinMessageRow[]; childFirstName: string }) {
  return (
    <details className="group mt-5 border-t border-[var(--hairline)] pt-4">
      <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)] hover:text-[var(--ink)]">
        <span className="group-open:hidden">View full check-in ▸</span>
        <span className="hidden group-open:inline">Hide full check-in ▾</span>
      </summary>
      {messages.length === 0 ? (
        <p className="mt-3 text-[14px] text-[var(--ink-3)]">The check-in conversation isn&apos;t available.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {messages.map((m) => {
            const fromParent = m.role === 'user';
            return (
              <li
                key={m.id}
                className={`grid grid-cols-[7rem_minmax(0,1fr)] gap-4 ${fromParent ? '' : 'text-[var(--ink-2)]'}`}
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  <div className={fromParent ? 'font-semibold text-[var(--ink)]' : ''}>
                    {fromParent ? `${childFirstName}'s parent` : 'AI'}
                  </div>
                  <div className="mt-0.5">{formatClock(m.created_at)}</div>
                </div>
                <p className={`whitespace-pre-line break-words text-[14px] leading-[1.55] ${fromParent ? 'text-[var(--ink)]' : ''}`}>
                  {m.content}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}

function VaccineList({
  label,
  rows,
  emphasis,
  given,
  yearly,
}: {
  label: string;
  rows: VaccinationRow[];
  emphasis?: boolean;
  given?: boolean;
  /** Annual vaccine: no due date to chase, never overdue. */
  yearly?: boolean;
}) {
  return (
    <div className="mb-5">
      <div
        className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
          emphasis
            ? 'font-semibold text-[var(--ink)] underline decoration-[var(--hairline-strong)] underline-offset-4'
            : 'text-[var(--ink-3)]'
        }`}
      >
        {label} · {rows.length}
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map((v) => (
          <li key={v.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-[var(--hairline)] py-2 text-[14px]">
            <span>
              {v.vaccine_name}{' '}
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">· {v.dose_label}</span>
            </span>
            <span
              className={`font-mono text-[11px] uppercase tracking-[0.14em] ${
                emphasis ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-2)]'
              }`}
            >
              {given
                ? v.administered_date
                  ? `given ${formatDate(v.administered_date)}`
                  : 'given · date unknown'
                : yearly
                  ? v.scheduled_date > todayIst()
                    ? `from ${formatDate(v.scheduled_date)}, then yearly`
                    : 'every year'
                  : `due ${formatDate(v.scheduled_date)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
  const isAlert = color === 'alert';
  return (
    <div
      className={`mb-4 pl-4 ${
        isAlert ? 'border-l-[3px] border-[var(--ink)]' : 'border-l border-[var(--hairline-strong)]'
      }`}
    >
      <div
        className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
          isAlert ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-3)]'
        }`}
      >
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
