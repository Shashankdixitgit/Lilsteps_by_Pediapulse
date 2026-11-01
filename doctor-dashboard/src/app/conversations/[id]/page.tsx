import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchAllergiesNotKnown, fetchUrgencies, noAllergiesLabel } from '@/lib/appointments';
import { allergyText } from '@/lib/consultations';
import { getCurrentDoctor } from '@/lib/doctor';
import { computeAge, formatClock, formatDayLong, formatDayShort, formatSlotTime, nowIstTime, todayIst, videoWindow } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UrgencyBadge } from '../../urgency-badge';
import { chatParentLabel } from '../parent-label';
import { Composer } from './composer';
import { MessagesRealtime } from './realtime';
import { ScrollToLatest } from './scroll-to-latest';

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
type ApptLite = { id: string; date: string; time: string; status: string; ai_summary_id: string | null; meet_link: string | null };

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ appt?: string }>;
}) {
  const { id } = await params;
  const { appt: apptParam } = await searchParams;
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

  // The thread is the signed-in doctor's own, so "Start video" uses their
  // room (read via getCurrentDoctor, not a doctors() join on the thread).
  const doctor = await getCurrentDoctor(supabase);
  const [{ data: messages }, { data: allergies }, { data: appts }, allergiesNotKnown] = await Promise.all([
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
          .select('id, date, time, status, ai_summary_id, meet_link')
          .eq('child_id', child.id)
          // Only this doctor's visits: the links below open and prescribe
          // against them.
          .eq('doctor_id', doctor?.doctorId ?? '')
          // Unpaid holds (0045) are not consults yet.
          .not('status', 'in', '(cancelled,awaiting_payment)')
          .order('date', { ascending: false })
          .order('time', { ascending: false })
          .returns<ApptLite[]>()
      : Promise.resolve({ data: [] as ApptLite[] }),
    child ? fetchAllergiesNotKnown(supabase, child.id) : Promise.resolve(false),
  ]);

  // An open visit from today on that the AI check-in marked urgent.
  const today = todayIst();
  const openAppts = (appts ?? []).filter((a) => a.status === 'upcoming' && a.date >= today);
  const urgencies = await fetchUrgencies(supabase, openAppts);
  const urgentAppt = openAppts.find((a) => urgencies.get(a.id) === 'urgent') ?? null;

  // The visit the "Consultation" and "Issue prescription" links act on: the
  // one the doctor came from (?appt=, only if it is theirs for this child),
  // else the nearest open visit (next upcoming from now, else the latest one
  // still waiting to be closed), else the most recent. The thread's stored
  // appointment_id is only the visit it was started from, so it is not used.
  const list = appts ?? [];
  const nowTime = nowIstTime();
  const open = list.filter((a) => a.status === 'upcoming');
  const ahead = open
    .filter((a) => a.date > today || (a.date === today && a.time.slice(0, 5) >= nowTime.slice(0, 5)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const consult =
    (apptParam ? list.find((a) => a.id === apptParam) : undefined) ??
    ahead[0] ??
    open[0] ??
    list[0] ??
    null;
  // "Start video" only while one of this child's open visits is inside its
  // video window (15 min before to 90 min after the start): that visit's own
  // Meet room, else the doctor's backup room.
  const liveVisit = list.find((a) => videoWindow(a.status, a.date, a.time) === 'open');
  const meetLink = liveVisit ? liveVisit.meet_link ?? doctor?.defaultMeetLink ?? null : null;

  // Group messages by day for editorial section breaks
  const grouped: { day: string; items: MessageRow[] }[] = [];
  (messages ?? []).forEach((m) => {
    const day = formatDayLong(m.created_at);
    const last = grouped[grouped.length - 1];
    if (last && last.day === day) last.items.push(m);
    else grouped.push({ day, items: [m] });
  });

  const hasAllergies = !!allergies && allergies.length > 0;
  const allergyFlag = hasAllergies || allergiesNotKnown;

  return (
    <>
      {/* Phone: the list (and its h1) is hidden while a thread is open. */}
      <h1 className="sr-only md:hidden">Messages with {child?.name ?? 'Unknown'}&apos;s parent</h1>
      {/* Thread header: who, safety flags, quick actions */}
      <header className="shrink-0 border-b border-[var(--hairline)] bg-[var(--card)] px-4 py-3 sm:px-5">
        <div className="flex items-start gap-2">
          <Link
            href="/conversations"
            aria-label="Back to all conversations"
            className="-ml-1.5 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--ink-2)] hover:bg-[var(--paper-soft)] md:hidden"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4">
              <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[18px] font-semibold leading-tight text-[var(--ink)]">
              <span className="truncate">{child?.name ?? 'Unknown'}</span>
              {child && (
                <span className="text-[13px] font-normal text-[var(--ink-3)]">
                  {computeAge(child.dob)} · {child.sex}
                </span>
              )}
              {urgentAppt && <UrgencyBadge urgency="urgent" />}
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-[var(--ink-3)]">Parent · {chatParentLabel(conversation.parents)}</p>
            <p className={`mt-1 text-[12.5px] ${allergyFlag ? 'font-semibold text-[var(--alert)]' : 'text-[var(--ink-3)]'}`}>
              {hasAllergies
                ? `⚠ Allergies: ${allergies.map(allergyText).join(', ')}`
                : allergiesNotKnown
                  ? `⚠ ${noAllergiesLabel(true)}.`
                  : noAllergiesLabel(false)}
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {consult && (
            <Link href={`/consultations/${consult.id}`} className="editorial-btn-ghost btn-sm">
              Open consult · {formatDayShort(consult.date)} {formatSlotTime(consult.time)}
            </Link>
          )}
          <Link
            // A no-show visit can't carry a prescription (0050); the chat alone can.
            href={`/prescriptions/new?child=${child?.id ?? ''}${
              consult && (consult.status === 'upcoming' || consult.status === 'completed')
                ? `&appointment=${consult.id}`
                : ''
            }`}
            className="btn-peach btn-sm"
          >
            Issue prescription
          </Link>
          {meetLink ? (
            <a href={meetLink} target="_blank" rel="noreferrer" className="btn-go btn-sm">
              Start video
            </a>
          ) : null}
          <Link
            href={`/prescriptions?child=${child?.id ?? ''}`}
            className="link-underline ml-1 text-[12.5px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)]"
          >
            Past prescriptions
          </Link>
        </div>

        {urgentAppt && (
          <p
            role="note"
            className="mt-2.5 rounded-lg border-l-[3px] border-[var(--ink)] bg-[var(--paper-soft)] px-3 py-2 text-[13px] leading-[1.45] text-[var(--ink)]"
          >
            <span className="font-semibold">Urgent visit</span> booked for {formatDayShort(urgentAppt.date)}{' '}
            {formatSlotTime(urgentAppt.time)}. The AI check-in flagged this child to be seen today.{' '}
            <Link href={`/consultations/${urgentAppt.id}`} className="link-underline font-medium">
              Open the visit
            </Link>
          </p>
        )}
      </header>

      {/* Messages: their own scroll area, newest at the bottom */}
      <section
        data-thread-scroll
        aria-label="Messages"
        className="min-h-0 flex-1 overflow-y-auto bg-[var(--paper)] px-3 py-5 sm:px-6"
      >
        {grouped.length === 0 ? (
          <p className="py-16 text-center text-[15px] text-[var(--ink-3)]">No messages yet. Say hello below.</p>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.day}>
                <div className="mb-4 flex justify-center">
                  <span className="rounded-full border border-[var(--hairline)] bg-[var(--card)] px-3 py-1 text-[11.5px] font-medium text-[var(--ink-3)]">
                    {g.day}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {g.items.map((m, i) => {
                    const mine = m.sender === 'doctor';
                    // Only the last of a run from one side shows its time.
                    const next = g.items[i + 1];
                    const endOfRun = !next || next.sender !== m.sender;
                    return (
                      <li key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${endOfRun ? 'pb-2' : ''}`}>
                        <div
                          className={`max-w-[85%] whitespace-pre-wrap px-3.5 py-2 text-[15px] leading-[1.45] text-[var(--ink)] [overflow-wrap:anywhere] sm:max-w-[70%] ${
                            mine
                              ? `rounded-2xl border border-[var(--ink)]/80 bg-[var(--lilac)] ${endOfRun ? 'rounded-br-md' : ''}`
                              : `rounded-2xl border border-[var(--hairline-strong)] bg-[var(--card)] ${endOfRun ? 'rounded-bl-md' : ''}`
                          }`}
                        >
                          {m.content}
                        </div>
                        {endOfRun && (
                          <div className="mt-1 px-1 text-[11.5px] text-[var(--ink-4)]">
                            {mine ? 'You' : 'Parent'} · {formatClock(m.created_at)}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
        <ScrollToLatest
          count={messages?.length ?? 0}
          lastFromDoctor={messages?.[messages.length - 1]?.sender === 'doctor'}
        />
      </section>

      <Composer conversationId={id} />
      <MessagesRealtime conversationId={id} />
    </>
  );
}
