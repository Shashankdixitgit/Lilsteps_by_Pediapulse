import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchUrgentChildIds } from '@/lib/appointments';
import { getCurrentDoctor } from '@/lib/doctor';
import { timeAgo, todayIst } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UrgencyBadge } from '../urgency-badge';
import { chatParentLabel } from './parent-label';

type ConversationRow = {
  id: string;
  last_message_at: string;
  children: { id: string; name: string; dob: string } | null;
  parents: { name: string | null; phone: string | null } | null;
};

type MessageLite = {
  conversation_id: string;
  sender: 'parent' | 'doctor';
  content: string;
  read_at: string | null;
  created_at: string;
};

export default async function ConversationsPage() {
  const supabase = await createSupabaseServerClient();
  const doctor = await getCurrentDoctor(supabase);
  if (!doctor) redirect('/login');

  const { data, error } = await supabase
    .from('conversations')
    .select('id, last_message_at, children(id, name, dob), parents(name, phone)')
    .eq('doctor_id', doctor.doctorId)
    .order('last_message_at', { ascending: false })
    .returns<ConversationRow[]>();

  // Last message + unread count per thread (parent messages the doctor hasn't opened).
  const ids = (data ?? []).map((c) => c.id);
  const childIds = [...new Set((data ?? []).map((c) => c.children?.id).filter((x): x is string => !!x))];
  const [{ data: msgs }, urgentChildren] = await Promise.all([
    ids.length
      ? supabase
          .from('messages')
          .select('conversation_id, sender, content, read_at, created_at')
          .in('conversation_id', ids)
          .order('created_at', { ascending: false })
          .returns<MessageLite[]>()
      : Promise.resolve({ data: [] as MessageLite[] }),
    // Threads whose child has an open visit the AI check-in marked urgent.
    fetchUrgentChildIds(supabase, doctor.doctorId, childIds, todayIst()),
  ]);
  const lastByConvo = new Map<string, MessageLite>();
  const unreadByConvo = new Map<string, number>();
  (msgs ?? []).forEach((m) => {
    if (!lastByConvo.has(m.conversation_id)) lastByConvo.set(m.conversation_id, m);
    if (m.sender === 'parent' && !m.read_at) {
      unreadByConvo.set(m.conversation_id, (unreadByConvo.get(m.conversation_id) ?? 0) + 1);
    }
  });

  // Urgent threads still waiting on the doctor go first (R2-11): the child has
  // an open visit the AI check-in marked urgent and the parent spoke last.
  // The rest stay most recent first (the query order; the sort is stable).
  const needsReplyUrgent = (c: ConversationRow) =>
    !!c.children && urgentChildren.has(c.children.id) && lastByConvo.get(c.id)?.sender === 'parent';
  const threads = [...(data ?? [])].sort(
    (a, b) => Number(needsReplyUrgent(b)) - Number(needsReplyUrgent(a)),
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-12">
      <header className="mb-10 fade-up">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Inbox
        </div>
        <h1 className="mt-2 font-display text-[40px] leading-tight text-[var(--ink)]">
          Conversations
        </h1>
        <p className="mt-2 text-[15px] text-[var(--ink-3)]">
          Threads from parents. Urgent ones waiting for your reply come first, then the most recent.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-[var(--hairline-strong)] border-l-2 border-l-[var(--ink)] px-5 py-4 font-mono text-[13px] text-[var(--ink)]">
          {error.message}
        </div>
      )}

      {!error && (!data || data.length === 0) && (
        <div className="rounded-xl border border-dashed border-[var(--hairline-strong)] bg-[var(--card)] py-20 text-center">
          <p className="font-display text-[20px] text-[var(--ink-2)]">No conversations yet</p>
          <p className="mt-2 text-[14px] text-[var(--ink-3)]">
            Messages from parents will appear here.
          </p>
        </div>
      )}

      {threads.length > 0 && (
        <ol className="space-y-0">
          {threads.map((c, idx) => {
            const last = lastByConvo.get(c.id);
            const unread = unreadByConvo.get(c.id) ?? 0;
            const urgent = !!c.children && urgentChildren.has(c.children.id);
            const awaitingReply = last?.sender === 'parent';
            return (
            <li
              key={c.id}
              className="fade-up border-t border-[var(--hairline)]"
              style={{ animationDelay: `${idx * 35}ms` }}
            >
              <Link
                href={`/conversations/${c.id}`}
                className={`group grid grid-cols-[3rem_1fr_auto] items-start gap-6 py-6 transition-colors hover:bg-[var(--card-overlay)] ${
                  urgent ? 'border-l-[3px] border-l-[var(--ink)] bg-[var(--paper-soft)] pl-4' : 'px-0'
                }`}
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-4)]">
                  {String(idx + 1).padStart(3, '0')}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display-italic text-[26px] leading-tight text-[var(--ink)]">
                      {c.children?.name ?? 'Unknown'}
                    </span>
                    {unread > 0 && (
                      <span className="rounded-full bg-[var(--ink)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--paper)]">
                        {unread} new
                      </span>
                    )}
                    {urgent && <UrgencyBadge urgency="urgent" className="self-center" />}
                  </div>
                  <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                    Parent ·{' '}
                    <span className="normal-case tracking-normal">
                      {chatParentLabel(c.parents)}
                    </span>
                  </div>
                  {urgent && (
                    <div className="mt-1 text-[13px] font-medium text-[var(--ink)]">
                      {awaitingReply
                        ? 'Upcoming visit flagged urgent by the AI check-in. Reply first.'
                        : 'Upcoming visit flagged urgent by the AI check-in.'}
                    </div>
                  )}
                  <div
                    className={`mt-2 truncate text-[14px] ${
                      unread > 0 ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-3)]'
                    }`}
                  >
                    {last
                      ? `${last.sender === 'doctor' ? 'You: ' : ''}${last.content}`
                      : 'No messages yet'}
                  </div>
                </div>
                <div className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  {timeAgo(last?.created_at ?? c.last_message_at)}
                </div>
              </Link>
            </li>
            );
          })}
          <li className="border-t border-[var(--hairline)]" />
        </ol>
      )}
    </main>
  );
}
