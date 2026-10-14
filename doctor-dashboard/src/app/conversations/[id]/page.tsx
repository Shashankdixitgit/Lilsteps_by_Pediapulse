import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchAllergiesNotKnown, fetchUrgencies, noAllergiesLabel } from '@/lib/appointments';
import { allergyText } from '@/lib/consultations';
import { getCurrentDoctor } from '@/lib/doctor';
import { computeAge, formatClock, formatDayLong, formatDayShort, formatSlotTime, todayIst } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UrgencyBadge } from '../../urgency-badge';
import { chatParentLabel } from '../parent-label';
import { Composer } from './composer';
import { MessagesRealtime } from './realtime';

type MessageRow = {
  id: string;
  sender: 'parent' | 'doctor';
  content: string;
  created_at: string;
  read_at: string | null;
};

type ConversationDetail = {
  id: string;
  appointment_id: string | null;
  children: { id: string; name: string; dob: string; sex: string } | null;
  parents: { name: string | null; phone: string | null } | null;
};

type AllergyRow = { id: string; name: string; severity: string };
type ApptLite = { id: string; date: string; time: string; status: string; ai_summary_id: string | null };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, appointment_id, children(id, name, dob, sex), parents(name, phone)')
    .eq('id', id)
    .maybeSingle<ConversationDetail>();

  if (!conversation) notFound();
  const child = conversation.children;

  // Opening the thread reads the parent's messages: clear them from the unread badge.
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', id)
    .eq('sender', 'parent')
    .is('read_at', null);

  const [{ data: messages }, { data: allergies }, { data: appts }, allergiesNotKnown, doctor] = await Promise.all([
    supabase
      .from('messages')
      .select('id, sender, content, created_at, read_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .returns<MessageRow[]>(),
    child
      ? supabase.from('allergies').select('id, name, severity').eq('child_id', child.id).returns<AllergyRow[]>()
      : Promise.resolve({ data: [] as AllergyRow[] }),
    child
      ? supabase
          .from('appointments')
          .select('id, date, time, status, ai_summary_id')
          .eq('child_id', child.id)
          .neq('status', 'cancelled')
          .order('date', { ascending: false })
          .order('time', { ascending: false })
          .returns<ApptLite[]>()
      : Promise.resolve({ data: [] as ApptLite[] }),
    child ? fetchAllergiesNotKnown(supabase, child.id) : Promise.resolve(false),
    // The thread is the signed-in doctor's own, so "Start video" uses their
    // room (read via getCurrentDoctor, not a doctors() join on the thread).
    getCurrentDoctor(supabase),
  ]);
  const meetLink = doctor?.defaultMeetLink ?? null;

  // An open visit from today on that the AI check-in marked urgent.
  const today = todayIst();
  const openAppts = (appts ?? []).filter((a) => a.status === 'upcoming' && a.date >= today);
  const urgencies = await fetchUrgencies(supabase, openAppts);
  const urgentAppt = openAppts.find((a) => urgencies.get(a.id) === 'urgent') ?? null;

  // Link back to the consult: the thread's own appointment, else the next
  // upcoming one, else the most recent.
  const consult =
    (appts ?? []).find((a) => a.id === conversation.appointment_id) ??
    [...(appts ?? [])].reverse().find((a) => a.status === 'upcoming') ??
    (appts ?? [])[0] ??
    null;

  // Group messages by day for editorial section breaks
  const grouped: { day: string; items: MessageRow[] }[] = [];
  (messages ?? []).forEach((m) => {
    const day = formatDayLong(m.created_at);
    const last = grouped[grouped.length - 1];
    if (last && last.day === day) last.items.push(m);
    else grouped.push({ day, items: [m] });
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-8">
      {/* Editorial conversation header */}
      <header className="py-10 fade-up">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Patient
        </div>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 font-display text-[36px] leading-tight text-[var(--ink)]">
          {child?.name ?? 'Unknown'}
          {urgentAppt && <UrgencyBadge urgency="urgent" />}
        </h1>
        {child && (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
            {computeAge(child.dob)} · {child.sex}
          </p>
        )}
        <p
          className={`mt-2 text-[14px] ${
            (allergies && allergies.length > 0) || allergiesNotKnown
              ? 'font-semibold text-[var(--ink)]'
              : 'text-[var(--ink-3)]'
          }`}
        >
          {allergies && allergies.length > 0
            ? `⚠ Allergies: ${allergies.map(allergyText).join(', ')}`
            : allergiesNotKnown
              ? `⚠ ${noAllergiesLabel(true)}.`
              : noAllergiesLabel(false)}
        </p>
        {urgentAppt && (
          <p
            role="note"
            className="mt-3 border-l-[3px] border-[var(--ink)] bg-[var(--paper-soft)] px-4 py-2 text-[14px] leading-[1.5] text-[var(--ink)]"
          >
            <span className="font-semibold">Urgent visit</span> booked for {formatDayShort(urgentAppt.date)}{' '}
            {formatSlotTime(urgentAppt.time)}. The AI check-in flagged this child to be seen today.{' '}
            <Link href={`/consultations/${urgentAppt.id}`} className="link-underline">
              Open the visit
            </Link>
          </p>
        )}
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
          Parent ·{' '}
          <span className="normal-case tracking-normal">
            {chatParentLabel(conversation.parents)}
          </span>
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          {consult && (
            <Link href={`/consultations/${consult.id}`} className="editorial-btn-ghost">
              Consultation · {formatDayShort(consult.date)} {formatSlotTime(consult.time)}
            </Link>
          )}
          {meetLink ? (
            <a
              href={meetLink}
              target="_blank"
              rel="noreferrer"
              className="editorial-btn-ghost"
            >
              Start video
            </a>
          ) : null}
          <Link
            href={`/prescriptions?child=${child?.id ?? ''}`}
            className="editorial-btn-ghost"
          >
            View prescriptions
          </Link>
          <Link
            href={`/prescriptions/new?child=${child?.id ?? ''}${
              conversation.appointment_id ? `&appointment=${conversation.appointment_id}` : ''
            }`}
            className="editorial-btn"
          >
            Issue prescription
          </Link>
        </div>
      </header>

      <section className="flex-1 border-t border-[var(--hairline)] py-10">
        {grouped.length === 0 ? (
          <p className="py-16 text-center font-display text-[18px] text-[var(--ink-3)]">
            No messages yet.
          </p>
        ) : (
          <div className="space-y-10">
            {grouped.map((g) => (
              <div key={g.day}>
                <div className="mb-6 flex items-baseline gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-4)]">
                    {g.day}
                  </span>
                  <span className="h-px flex-1 bg-[var(--hairline)]" />
                </div>
                <ul className="space-y-4">
                  {g.items.map((m) => (
                    <li
                      key={m.id}
                      className={`flex ${
                        m.sender === 'doctor' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[78%] ${
                          m.sender === 'doctor'
                            ? 'border-r-2 border-[var(--ink)] pr-4 text-right'
                            : 'border-l-2 border-[var(--accent)] pl-4'
                        }`}
                      >
                        <div className="font-sans text-[15.5px] leading-[1.55] text-[var(--ink)]">
                          {m.content}
                        </div>
                        <div
                          className={`mt-1.5 flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-4)] ${
                            m.sender === 'doctor' ? 'justify-end' : ''
                          }`}
                        >
                          <span>{m.sender === 'doctor' ? 'You' : 'Parent'}</span>
                          <span className="text-[var(--hairline-strong)]">·</span>
                          <span>{formatClock(m.created_at)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <Composer conversationId={id} />
      <MessagesRealtime conversationId={id} />
    </main>
  );
}
