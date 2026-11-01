'use client';

import { useId, useSyncExternalStore } from 'react';

// Same-tab writes don't fire 'storage', so toggles announce themselves too.
const EVENT = 'lilsteps:collapsible';

// This tab's choices, so toggling still works when storage is blocked
// (private window, site data off); it just isn't remembered then.
const memory = new Map<string, string>();

function read(key: string): string | null {
  const local = memory.get(key);
  if (local !== undefined) return local;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(EVENT, cb);
  };
}

/**
 * A home-page section with a toggle header (title, count, chevron). Open or
 * closed is remembered per doctor in localStorage; when nothing is stored
 * (first visit, private window, storage blocked) it uses `defaultOpen`.
 */
export function CollapsibleSection({
  title,
  count,
  hint,
  storageKey,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  hint: string;
  storageKey: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const panelId = useId();
  const stored = useSyncExternalStore(
    subscribe,
    () => read(storageKey),
    () => null,
  );
  const open = stored === null ? defaultOpen : stored === '1';

  function toggle() {
    const next = open ? '0' : '1';
    memory.set(storageKey, next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Storage blocked: the in-memory choice above still applies.
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <section className="mt-10 fade-up">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="group -ml-2 flex items-center gap-2.5 rounded-lg px-2 py-1 text-left hover:bg-[var(--paper-soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent-soft)]"
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className={`h-4 w-4 text-[var(--ink-3)] transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          >
            <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 className="font-display text-[20px] text-[var(--ink)]">{title}</h2>
          <span className="rounded-full border border-[var(--hairline-strong)] bg-[var(--card)] px-2 py-0.5 text-[12px] font-semibold tabular-nums text-[var(--ink-2)]">
            {count}
          </span>
        </button>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-3)]">{hint}</span>
      </div>
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
