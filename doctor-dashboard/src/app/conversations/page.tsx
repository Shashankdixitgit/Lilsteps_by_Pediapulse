import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type ConversationRow = {
  id: string;
  last_message_at: string;
  children: { id: string; name: string; dob: string } | null;
  parents: { name: string | null; phone: string | null } | null;
};

function relative(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export default async function ConversationsPage() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('conversations')
    .select('id, last_message_at, children(id, name, dob), parents(name, phone)')
    .order('last_message_at', { ascending: false })
    .returns<ConversationRow[]>();

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
          Threads from parents — most recent first.
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

      {data && data.length > 0 && (
        <ol className="space-y-0">
          {data.map((c, idx) => (
            <li
              key={c.id}
              className="fade-up border-t border-[var(--hairline)]"
              style={{ animationDelay: `${idx * 35}ms` }}
            >
              <Link
                href={`/conversations/${c.id}`}
                className="group grid grid-cols-[3rem_1fr_auto] items-baseline gap-6 px-0 py-6 transition-colors hover:bg-[var(--card-overlay)]"
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-4)]">
                  {String(idx + 1).padStart(3, '0')}
                </div>
                <div>
                  <div className="font-display-italic text-[26px] leading-tight text-[var(--ink)]">
                    {c.children?.name ?? 'Unknown'}
                  </div>
                  <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                    Parent ·{' '}
                    <span className="lowercase tracking-normal">
                      {c.parents?.name ?? c.parents?.phone ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  {relative(c.last_message_at)}
                </div>
              </Link>
            </li>
          ))}
          <li className="border-t border-[var(--hairline)]" />
        </ol>
      )}
    </main>
  );
}
