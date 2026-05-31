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
    <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-16">
      <header className="mb-14 fade-up">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Correspondence
        </div>
        <h1 className="mt-4 font-display text-[56px] leading-[0.95] tracking-[-0.03em] text-[var(--ink)]">
          Open <span className="font-display-italic">conversations</span>
        </h1>
        <p className="mt-4 max-w-xl font-display-italic text-[18px] leading-[1.55] text-[var(--ink-2)]">
          Threads from parents — most recent first.
        </p>
      </header>

      {error && (
        <div className="border-l-2 border-[var(--alert)] px-5 py-4 font-mono text-[13px] text-[var(--alert)]">
          {error.message}
        </div>
      )}

      {!error && (!data || data.length === 0) && (
        <div className="border-t border-[var(--hairline)] py-24 text-center">
          <p className="font-display-italic text-[26px] text-[var(--ink-3)]">
            Nothing to read.
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
