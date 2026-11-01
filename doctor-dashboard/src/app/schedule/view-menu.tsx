'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { VIEW_LABEL, type CalendarView } from '@/lib/calendar';

/**
 * Day / 3 days / Week picker. A <details> menu that also closes after a
 * choice, on Escape and on a click outside it (a plain <details> stays open
 * across client navigation and covers the grid).
 */
export function ViewMenu({ view, links }: { view: CalendarView; links: { view: CalendarView; href: string }[] }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => {
      if (ref.current) ref.current.open = false;
    };
    const onPointer = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) {
        close();
        ref.current?.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <details ref={ref} className="relative [&_summary::-webkit-details-marker]:hidden">
      <summary className="editorial-btn-ghost btn-sm list-none" aria-label={`View: ${VIEW_LABEL[view]}`}>
        {VIEW_LABEL[view]}
        <span aria-hidden className="text-[10px] text-[var(--ink-3)]">▾</span>
      </summary>
      <ul className="absolute right-0 z-40 mt-2 w-36 rounded-xl border border-[var(--hairline-strong)] bg-[var(--card)] p-1 shadow-[2px_2px_0_var(--ink)]">
        {links.map((l) => (
          <li key={l.view}>
            <Link
              href={l.href}
              onClick={() => {
                if (ref.current) ref.current.open = false;
              }}
              aria-current={l.view === view ? 'true' : undefined}
              className={`block rounded-lg px-3 py-2 text-[13.5px] ${
                l.view === view ? 'bg-[var(--accent-pale)] font-semibold text-[var(--accent)]' : 'text-[var(--ink-2)] hover:bg-[var(--paper-soft)]'
              }`}
            >
              {VIEW_LABEL[l.view]}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
