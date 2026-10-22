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

  const firstName = child.name.split(' ')[0];
  const hasFlags = !!(allergies?.length || conditions?.length || medications?.length || allergiesNotKnown);
  const lastMeasured = growth?.[0]?.measured_at ?? null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-10">
      {issued && (
        <Suspense>
          <FlashToast param="issued" message={`Prescription issued to ${firstName}'s parent`} />
        </Suspense>
      )}

      <Link href="/" className="link-underline text-[13px] text-[var(--ink-3)]">
        ← Back to queue
      </Link>

      {/* Patient header */}
      <header className="mt-5 fade-up rounded-2xl border border-[var(--hairline)] bg-[var(--card)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="font-display text-[32px] leading-tight text-[var(--ink)]">{child.name}</h1>
            <p className="mt-1 text-[15px] text-[var(--ink-2)]">
              {age} · <span className="capitalize">{child.sex}</span>
            </p>
            <p className="mt-1 text-[14px] text-[var(--ink-3)]">Parent: {parentContact(appointment.parents)}</p>
          </div>
          <div className="text-right">
            <div className="text-[15px] font-semibold text-[var(--ink)]">
              {stamp.weekday} {stamp.day} {stamp.month} · {stamp.time}
            </div>
            <div className="mt-0.5 text-[13px] text-[var(--ink-3)]">Video consult · 30 min</div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                  appointment.status === 'upcoming'
                    ? 'border-[var(--ink)] text-[var(--ink)]'
                    : 'border-[var(--hairline-strong)] text-[var(--ink-3)]'
                }`}
              >
                {STATUS_LABEL[appointment.status] ?? appointment.status}
              </span>
              <UrgencyBadge urgency={urgency} />
              {isLate && <LateBadge />}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] pt-5">
          {meetLink && (
            // Per-appointment Calendar-event Meet link, else the doctor's permanent room.
            <a href={meetLink} target="_blank" rel="noreferrer" className="editorial-btn">
              Start video
            </a>
          )}
          <OpenChatButton appointmentId={appointment.id} />
          <Link href={`/prescriptions/new?child=${child.id}&appointment=${appointment.id}`} className="editorial-btn-ghost">
            {prescriptions.length > 0 ? 'Issue another prescription' : 'Issue prescription'}
          </Link>
          <Link href={`/prescriptions?child=${child.id}`} className="editorial-btn-ghost">
            Past prescriptions
          </Link>
        </div>
      </header>

      {urgency === 'urgent' && appointment.status === 'upcoming' && (
        <div
          role="note"
          className="mt-4 rounded-xl border-l-[3px] border-[var(--ink)] bg-[var(--paper-soft)] px-5 py-3 text-[14px] leading-[1.55] text-[var(--ink)]"
        >
          <span className="font-semibold">Urgent check-in.</span> The AI check-in suggests seeing {firstName} today.
        </div>
      )}
      {showVideoBanner && <VideoLinkBanner className="mt-4" />}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Main column ── */}
        <div className="min-w-0 space-y-6">
          {/* appointments.concern (migration 0020): typed by the parent in "Book a doctor". */}
          {concern && (
            <Card title={concernFromCheckin ? 'Reason (from check-in)' : 'Reason for visit, in the parent’s words'}>
              <p className="text-[16px] leading-[1.5] text-[var(--ink)]">&ldquo;{concern}&rdquo;</p>
            </Card>
          )}

          <Card title="Pre-visit summary" tag={summary ? 'Written by AI' : undefined}>
            {summary ? (
              <>
                <div
                  role="note"
                  className="mb-5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--paper-soft)] px-4 py-3 text-[13.5px] leading-[1.55] text-[var(--ink-2)]"
                >
                  <span className="font-semibold text-[var(--ink)]">This is a summary the AI created</span> from the
                  parent&apos;s check-in answers. It can miss or misread details and is not a diagnosis. Use it as a
                  starting point, and talk to the parent in your own natural flow.
                </div>

                <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Main concern</div>
                <p className="mt-1 font-display text-[22px] leading-[1.3] text-[var(--ink)]">{summary.chiefComplaint}</p>
                {urgency && (
                  <p className="mt-1 text-[13px] text-[var(--ink-3)]">
                    AI-suggested urgency: <span className="font-medium text-[var(--ink-2)]">{URGENCY_LABEL[urgency] ?? urgency}</span>
                  </p>
                )}

                {summary.allergyNote && (
                  <p className="mt-4 rounded-lg border-l-[3px] border-[var(--ink)] bg-[var(--paper-soft)] px-4 py-2 text-[14px] font-semibold text-[var(--ink)]">
                    ⚠ {summary.allergyNote}
                  </p>
                )}

                <Table
                  className="mt-5"
                  head={['What the AI asked about', 'What the parent said']}
                  rows={summary.details.map((d) => [d.label, cleanSummaryValue(d.value)])}
                />

                {summary.relevantHistory && (
                  <p className="mt-4 text-[14px] leading-[1.55] text-[var(--ink-2)]">
                    <span className="font-semibold text-[var(--ink)]">Relevant history:</span> {summary.relevantHistory}
                  </p>
                )}

                <CheckinTranscript messages={transcript} childFirstName={firstName} />
              </>
            ) : (
              <>
                <p className="text-[14px] leading-[1.55] text-[var(--ink-3)]">
                  {checkin?.initial_complaint
                    ? `The parent started a check-in ("${checkin.initial_complaint}") but no summary was generated.`
                    : 'The parent booked without an AI check-in. Ask about symptoms at the start of the call.'}
                </p>
                {transcript.length > 0 && <CheckinTranscript messages={transcript} childFirstName={firstName} />}
              </>
            )}
          </Card>

          <Card
            title="Visit notes"
            tag={appointment.status === 'upcoming' ? 'Close the visit' : STATUS_LABEL[appointment.status] ?? appointment.status}
          >
            <VisitNotesForm
              appointmentId={appointment.id}
              status={appointment.status}
              initial={notesInitial}
              childFirstName={firstName}
              slotDate={appointment.date}
              slotTime={appointment.time}
            />
          </Card>

          {/* Path-specific onboarding answers (C1, children.onboarding_answers) */}
          <Card title="Background from onboarding" tag={onboardingAnswersEyebrow(child.onboarding_answers)}>
            <OnboardingAnswersList answers={child.onboarding_answers} childFirstName={firstName} />
          </Card>

          <Card title="Immunisation">
            <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
              <Pill>{doneVaccines.length} given</Pill>
              <Pill strong={overdueVaccines.length > 0}>{overdueVaccines.length} overdue</Pill>
              <Pill>{upcomingVaccines.length} upcoming</Pill>
            </div>
            {allVaccines.length === 0 ? (
              <Empty>No vaccination schedule on file.</Empty>
            ) : (
              <>
                {(overdueVaccines.length > 0 || upcomingVaccines.length > 0 || yearlyVaccines.length > 0 || otherVaccines.length > 0) && (
                  <Table
                    head={['Vaccine', 'Dose', 'Status']}
                    rows={[
                      ...overdueVaccines.map((v) => [v.vaccine_name, v.dose_label, <b key="s">Overdue · due {formatDate(v.scheduled_date)}</b>]),
                      ...upcomingVaccines.slice(0, UPCOMING_PREVIEW).map((v) => [v.vaccine_name, v.dose_label, `Due ${formatDate(v.scheduled_date)}`]),
                      ...yearlyVaccines.map((v) => [
                        v.vaccine_name,
                        v.dose_label,
                        v.scheduled_date > today ? `From ${formatDate(v.scheduled_date)}, then yearly` : 'Yearly · offer each flu season',
                      ]),
                      ...otherVaccines.map((v) => [v.vaccine_name, v.dose_label, 'Not sure if given · discuss catch-up']),
                    ]}
                  />
                )}
                {upcomingVaccines.length > UPCOMING_PREVIEW && (
                  <Fold label={`Show ${upcomingVaccines.length - UPCOMING_PREVIEW} later doses`}>
                    <Table
                      head={['Vaccine', 'Dose', 'Status']}
                      rows={upcomingVaccines.slice(UPCOMING_PREVIEW).map((v) => [v.vaccine_name, v.dose_label, `Due ${formatDate(v.scheduled_date)}`])}
                    />
                  </Fold>
                )}
                {doneVaccines.length > 0 && (
                  <Fold label={`Show ${doneVaccines.length} given`}>
                    <Table
                      head={['Vaccine', 'Dose', 'Given']}
                      rows={doneVaccines.map((v) => [
                        v.vaccine_name,
                        v.dose_label,
                        v.administered_date ? formatDate(v.administered_date) : 'Date unknown',
                      ])}
                    />
                  </Fold>
                )}
              </>
            )}
          </Card>
        </div>

        {/* ── Sidebar: quick reference ── */}
        <aside className="min-w-0 space-y-6">
          <Card title="Vitals" small>
            <Table
              compact
              rows={[
                ['Weight', latestWeight ? `${latestWeight} kg` : '—'],
                ['Height', latestHeight ? `${latestHeight} cm` : '—'],
                ['Blood group', child.blood_group ?? '—'],
                ...(lastMeasured ? [['Last measured', formatDate(lastMeasured)]] : []),
              ]}
            />
            {growth && growth.length > 1 && (
              <Fold label="Earlier measurements">
                <Table
                  compact
                  head={['Date', 'Weight', 'Height']}
                  rows={growth.map((g) => [formatDate(g.measured_at), g.weight ? `${g.weight} kg` : '—', g.height ? `${g.height} cm` : '—'])}
                />
              </Fold>
            )}
          </Card>

          <Card title="Allergies & conditions" small>
            {!hasFlags ? (
              <Empty>None on file.</Empty>
            ) : (
              <div className="space-y-4">
                {(allergies?.length || allergiesNotKnown) ? (
                  <FlagList
                    label="Allergies"
                    alert
                    items={
                      allergies?.length
                        ? allergies.map((a) => `${a.name} · ${severityLabel(a.severity)} (${a.type})`)
                        : [`${noAllergiesLabel(true)}`]
                    }
                  />
                ) : null}
                {conditions?.length ? (
                  <FlagList label="Conditions" items={conditions.map((c) => (c.details ? `${c.name}: ${c.details}` : c.name))} />
                ) : null}
                {medications?.length ? (
                  <FlagList
                    label="Current medicines"
                    items={medications.map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(' · '))}
                  />
                ) : null}
              </div>
            )}
          </Card>

          <Card title="Prescriptions for this visit" small>
            {prescriptions.length === 0 ? (
              <Empty>None issued yet.</Empty>
            ) : (
              <div className="space-y-4">
                {prescriptions.map((p, i) => (
                  <div key={p.id}>
                    <div className="text-[12px] text-[var(--ink-3)]">
                      ℞ {i + 1} · {formatDateTime(p.issued_at)}
                    </div>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] text-[var(--ink)]">
                      {[...p.prescription_items]
                        .sort((a, b) => a.position - b.position)
                        .map((it) => (
                          <li key={it.id}>
                            <span className="font-medium">{it.medicine}</span>
                            <span className="text-[var(--ink-3)]">
                              {' '}
                              · {it.dose} · {it.frequency}
                              {it.duration ? ` · ${it.duration}` : ''}
                            </span>
                          </li>
                        ))}
                    </ul>
                    {p.notes && <p className="mt-1 text-[13px] text-[var(--ink-3)]">Note: {p.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Health records" small tag={documents?.length ? `${documents.length}` : undefined}>
            {documentsError ? (
              <Empty>Could not load records: {documentsError.message}</Empty>
            ) : !documents || documents.length === 0 ? (
              <Empty>No records uploaded.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] text-[var(--ink)]">{d.title}</div>
                      <div className="text-[12px] text-[var(--ink-3)]">
                        {DOC_CATEGORY[d.category] ?? d.category} · {formatDate(d.document_date)}
                        {d.doctor_name ? ` · ${d.doctor_name}` : ''}
                      </div>
                      {d.notes ? <div className="text-[12px] text-[var(--ink-2)]">{d.notes}</div> : null}
                    </div>
                    <a href={`/records/${d.id}`} target="_blank" rel="noreferrer" className="link-underline shrink-0 text-[13px] text-[var(--ink)]">
                      Open ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Health log" small tag={healthNotes?.length ? `Latest ${healthNotes.length}` : undefined}>
            {healthNotesError ? (
              <Empty>Could not load the health log: {healthNotesError.message}</Empty>
            ) : !healthNotes || healthNotes.length === 0 ? (
              <Empty>No notes from the parent.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {healthNotes.map((n) => (
                  <li key={n.id} className="py-2.5">
                    <div className="text-[12px] text-[var(--ink-3)]">
                      {formatDateTime(n.noted_at)} · {NOTE_CATEGORY[n.category] ?? n.category}
                      {n.severity ? ` · severity ${n.severity}/5` : ''}
                    </div>
                    <p className="mt-0.5 whitespace-pre-line break-words text-[14px] leading-[1.5] text-[var(--ink)]">{n.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
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
    <Fold label="Read the full check-in conversation" className="mt-5 border-t border-[var(--hairline)] pt-4">
      {messages.length === 0 ? (
        <Empty>The check-in conversation isn&apos;t available.</Empty>
      ) : (
        <ol className="space-y-2.5">
          {messages.map((m) => {
            const fromParent = m.role === 'user';
            return (
              <li key={m.id} className={`flex ${fromParent ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] leading-[1.5] ${
                    fromParent ? 'bg-[var(--ink)] text-[var(--paper)]' : 'border border-[var(--hairline)] bg-[var(--paper-soft)] text-[var(--ink)]'
                  }`}
                >
                  <div className={`mb-0.5 text-[11px] ${fromParent ? 'text-[var(--ink-4)]' : 'text-[var(--ink-3)]'}`}>
                    {fromParent ? `${childFirstName}'s parent` : 'AI'} · {formatClock(m.created_at)}
                  </div>
                  <p className="whitespace-pre-line break-words">{m.content}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Fold>
  );
}

function Card({
  title,
  tag,
  small,
  children,
}: {
  title: string;
  tag?: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`fade-up rounded-2xl border border-[var(--hairline)] bg-[var(--card)] ${small ? 'p-5' : 'p-6'}`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className={`font-display leading-tight text-[var(--ink)] ${small ? 'text-[17px]' : 'text-[21px]'}`}>{title}</h2>
        {tag && <span className="shrink-0 text-[12px] text-[var(--ink-3)]">{tag}</span>}
      </div>
      {children}
    </section>
  );
}

/** A plain bordered table: first column is the label, the rest the values. */
function Table({
  head,
  rows,
  compact,
  className,
}: {
  head?: string[];
  rows: React.ReactNode[][];
  compact?: boolean;
  className?: string;
}) {
  const pad = compact ? 'px-3 py-2' : 'px-4 py-2.5';
  return (
    <div className={`overflow-x-auto rounded-xl border border-[var(--hairline)] ${className ?? ''}`}>
      <table className="w-full border-collapse text-left text-[14px]">
        {head && (
          <thead className="bg-[var(--paper-soft)]">
            <tr>
              {head.map((h) => (
                <th key={h} className={`${pad} border-b border-[var(--hairline)] text-[12px] font-semibold text-[var(--ink-2)]`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--hairline)] first:border-t-0">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={`${pad} align-top leading-[1.5] ${
                    j === 0 && !head ? `${compact ? 'w-[46%]' : 'w-[38%]'} text-[var(--ink-3)]` : j === 0 ? 'w-[38%] text-[var(--ink)]' : 'text-[var(--ink)]'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fold({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <details className={`group mt-3 ${className ?? ''}`}>
      <summary className="cursor-pointer list-none text-[13px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)]">
        <span className="group-open:hidden">{label} ▸</span>
        <span className="hidden group-open:inline">Hide ▾</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Pill({ strong, children }: { strong?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-3 py-1 ${
        strong
          ? 'bg-[var(--ink)] font-semibold text-[var(--paper)]'
          : 'border border-[var(--hairline-strong)] text-[var(--ink-2)]'
      }`}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-[var(--ink-3)]">{children}</p>;
}

function FlagList({ label, items, alert }: { label: string; items: string[]; alert?: boolean }) {
  return (
    <div className={alert ? 'border-l-[3px] border-[var(--ink)] pl-3' : ''}>
      <div className={`text-[12px] ${alert ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}>{label}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-[var(--ink)]">
        {items.map((it, i) => (
          <li key={`${i}-${it}`}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
