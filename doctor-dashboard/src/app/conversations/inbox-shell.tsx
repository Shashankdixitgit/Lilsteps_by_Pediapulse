'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The two-pane frame. It fills the screen below the sticky nav (whose height
 * changes as it wraps, so it is measured into --nav-h), and each pane scrolls
 * on its own. Below md only one pane shows: the list on /conversations, the
 * thread on /conversations/[id].
 */
export function InboxShell({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const inThread = /^\/conversations\/[^/]+/.test(pathname ?? '');

  useEffect(() => {
    const nav = document.querySelector('body > nav');
    if (!nav) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--nav-h', `${Math.round(nav.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(nav);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--nav-h');
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 md:px-6 md:py-5">
      <div
        className="grid h-[calc(100dvh-var(--nav-h,72px))] grid-cols-1 overflow-hidden bg-[var(--card)] md:h-[calc(100dvh-var(--nav-h,72px)-2.5rem)] md:grid-cols-[20rem_minmax(0,1fr)] md:rounded-2xl md:border md:border-[var(--hairline)] lg:grid-cols-[23rem_minmax(0,1fr)]"
      >
        <div
          className={`min-h-0 flex-col border-[var(--hairline)] md:flex md:border-r ${inThread ? 'hidden' : 'flex'}`}
        >
          {list}
        </div>
        <div className={`min-h-0 min-w-0 flex-col md:flex ${inThread ? 'flex' : 'hidden'}`}>{children}</div>
      </div>
    </main>
  );
}
