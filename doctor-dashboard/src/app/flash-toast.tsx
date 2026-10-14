'use client';

import { useEffect, useState } from 'react';

/**
 * One-shot confirmation toast. A server action redirects with a query flag
 * (e.g. ?issued=1); the page renders this with the message. It removes the
 * flag from the URL so a refresh does not show it again, and fades after 5s.
 *
 * The URL is cleaned with window.history.replaceState, not router.replace:
 * a router navigation re-renders the server page without the flag, which
 * unmounted this toast about a second after it appeared. replaceState only
 * updates the address bar, so the page (and the toast) stay as they are.
 */
export function FlashToast({ message, param }: { message: string; param: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [param]);

  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fade-up fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 bg-[var(--ink)] px-5 py-3 text-[14px] text-[var(--paper)] shadow-lg"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-4)] hover:text-[var(--paper)]"
      >
        ✕
      </button>
    </div>
  );
}
