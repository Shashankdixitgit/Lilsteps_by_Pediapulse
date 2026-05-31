import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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
  doctors: { default_meet_link: string | null } | null;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, appointment_id, children(id, name, dob, sex), parents(name, phone), doctors(default_meet_link)')
    .eq('id', id)
    .maybeSingle<ConversationDetail>();

  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from('messages')
    .select('id, sender, content, created_at, read_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .returns<MessageRow[]>();

  // Group messages by day for editorial section breaks
  const grouped: { day: string; items: MessageRow[] }[] = [];
  (messages ?? []).forEach((m) => {
    const day = formatDay(m.created_at);
    const last = grouped[grouped.length - 1];
    if (last && last.day === day) last.items.push(m);
    else grouped.push({ day, items: [m] });
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-8">
      {/* Editorial conversation header */}
      <header className="py-10 fade-up">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Patient
        </div>
        <h1 className="mt-3 font-display text-[44px] leading-[1] tracking-[-0.025em] text-[var(--ink)]">
          <span className="font-display-italic">{conversation.children?.name ?? 'Unknown'}</span>
        </h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
          Parent ·{' '}
          <span className="lowercase tracking-normal">
            {conversation.parents?.name ?? conversation.parents?.phone ?? '—'}
          </span>
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          {conversation.doctors?.default_meet_link ? (
            <a
              href={conversation.doctors.default_meet_link}
              target="_blank"
              rel="noreferrer"
              className="editorial-btn-ghost"
            >
              Start video
            </a>
          ) : null}
          <Link
            href={`/prescriptions?child=${conversation.children?.id ?? ''}`}
            className="editorial-btn-ghost"
          >
            View prescriptions
          </Link>
          <Link
            href={`/prescriptions/new?child=${conversation.children?.id ?? ''}${
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
          <p className="py-16 text-center font-display-italic text-[22px] text-[var(--ink-3)]">
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
                          <span>{formatTime(m.created_at)}</span>
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
