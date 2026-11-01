'use client';

import { useRouter } from 'next/navigation';

/**
 * Phone / tablet stand-in for the mini month: a native date picker that
 * jumps the schedule to the chosen day, keeping the current view.
 */
export function DateJump({ value, today, view }: { value: string; today: string; view: number }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-[var(--ink-3)]">
      <span>Go to</span>
      <input
        type="date"
        value={value}
        aria-label="Go to date"
        onChange={(e) => {
          const d = e.target.value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
          const q = new URLSearchParams();
          if (d !== today) q.set('d', d);
          if (view !== 3) q.set('v', String(view));
          const s = q.toString();
          router.push(s ? `/?${s}` : '/');
        }}
        className="rounded-lg border border-[var(--hairline-strong)] bg-[var(--card)] px-2 py-1 text-[13px] text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-soft)]"
      />
    </label>
  );
}
