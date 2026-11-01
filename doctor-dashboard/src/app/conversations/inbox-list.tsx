'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { InboxThread } from './inbox-data';

/** Pastel avatar fill, picked from the name so a child keeps their colour. */
const AVATAR = ['var(--lilac)', 'var(--peach)', '#dff0e8', '#fff1d9', 'var(--accent-pale)'];
function avatarFill(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

export function InboxList({ threads, error }: { threads: InboxThread[]; error: string | null }) {
  const pathname = usePathname();
  const selectedId = pathname?.match(/^\/conversations\/([^/]+)/)?.[1] ?? null;
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const shown = q
    ? threads.filter((t) => `${t.childName} ${t.parent} ${t.preview}`.toLowerCase().includes(q))
    : threads;

  return (
    <>
      <div className="shrink-0 border-b border-[var(--hairline)] px-4 pb-3 pt-4">
        <h1 className="font-display text-[22px] leading-tight text-[var(--ink)]">Messages</h1>
        <label className="relative mt-3 block">
          <span className="sr-only">Search conversations</span>
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-4)]"
          >
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by child or parent"
            className="w-full rounded-full border border-[var(--hairline-strong)] bg-[var(--paper)] py-2 pl-9 pr-4 text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--ink)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-soft)]"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p role="alert" className="m-4 rounded-lg border border-[var(--hairline-strong)] px-4 py-3 text-[13px] text-[var(--ink)]">
            {error}
          </p>
        ) : threads.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-display text-[18px] text-[var(--ink-2)]">No conversations yet</p>
            <p className="mt-2 text-[13.5px] text-[var(--ink-3)]">Messages from parents will appear here.</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-6 py-12 text-center text-[13.5px] text-[var(--ink-3)]">No conversations match “{query.trim()}”.</p>
        ) : (
          <ul aria-label="Conversations">
            {shown.map((t) => {
              const selected = t.id === selectedId;
              // The open thread is read as it renders; don't show it as unread.
              const unread = selected ? 0 : t.unread;
              return (
                <li key={t.id}>
                  <Link
                    href={`/conversations/${t.id}`}
                    aria-current={selected ? 'page' : undefined}
                    className={`relative flex gap-3 border-b border-[var(--hairline)] px-4 py-3.5 transition-colors ${
                      selected ? 'bg-[var(--accent-pale)]' : 'hover:bg-[var(--paper-soft)]'
                    }`}
                  >
                    {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]" />}
                    <span
                      aria-hidden
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--hairline-strong)] text-[15px] font-semibold text-[var(--ink)]"
                      style={{ background: avatarFill(t.childName) }}
                    >
                      {t.childName.trim().charAt(0).toUpperCase() || '?'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className={`truncate text-[15px] text-[var(--ink)] ${unread > 0 ? 'font-bold' : 'font-semibold'}`}>
                            {t.childName}
                          </span>
                          {t.childAge && <span className="shrink-0 text-[12px] text-[var(--ink-3)]">{t.childAge}</span>}
                        </span>
                        <span
                          title={t.whenTitle}
                          className={`shrink-0 text-[12px] ${unread > 0 ? 'font-semibold text-[var(--accent)]' : 'text-[var(--ink-3)]'}`}
                        >
                          {t.when}
                        </span>
                      </span>
                      <span className="block truncate text-[12.5px] text-[var(--ink-3)]">Parent · {t.parent}</span>
                      {t.urgent && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#b93d27] px-2 py-0.5 text-[10.5px] font-semibold text-white">
                          ⚠ Urgent{t.awaitingReply ? ' · reply first' : ''}
                        </span>
                      )}
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-[13.5px] ${
                            unread > 0 ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-3)]'
                          } ${t.hasMessages ? '' : 'italic'}`}
                        >
                          {t.lastFromDoctor ? 'You: ' : ''}
                          {t.preview}
                        </span>
                        {unread > 0 && (
                          <span
                            aria-label={`${unread} unread`}
                            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold leading-none text-white"
                          >
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
