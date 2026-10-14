'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { dateStamp, formatDayShort } from '@/lib/format';
import { deleteSlotAction, deleteSlotsForDateAction, toggleSlotAction } from './actions';

export interface DaySlots {
  date: string;
  items: {
    id: string;
    time: string;
    is_available: boolean;
    /** Set when a live appointment holds this slot — no toggle or delete. */
    booking: { appointmentId: string; childName: string } | null;
  }[];
}

export function SlotsDay({ day }: { day: DaySlots }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const d = dateStamp(day.date);
  const availableCount = day.items.filter((s) => s.is_available && !s.booking).length;
  const bookedCount = day.items.filter((s) => s.booking).length;
  const clearable = day.items.length - bookedCount;

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  }
  function clearDay() {
    const keep = bookedCount > 0 ? ` ${bookedCount} booked slot${bookedCount === 1 ? '' : 's'} will be kept.` : '';
    if (!confirm(`Delete ${clearable} slot${clearable === 1 ? '' : 's'} on ${formatDayShort(day.date)}?${keep}`)) return;
    run(() => deleteSlotsForDateAction(day.date));
  }

  return (
    <li className="grid grid-cols-[6rem_1fr] gap-6 border-t border-[var(--hairline)] py-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
          {d.weekday} {d.month}
        </div>
        <div className="font-display text-[36px] leading-[1] text-[var(--ink)]">{d.day}</div>
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
          {availableCount}/{day.items.length} open
        </div>
        {bookedCount > 0 && (
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--ink)]">
            {bookedCount} booked
          </div>
        )}
        {clearable > 0 && (
          <button
            type="button"
            onClick={clearDay}
            disabled={pending}
            className="link-underline mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)] hover:text-[var(--alert)]"
          >
            Clear day
          </button>
        )}
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          {day.items.map((s) =>
            s.booking ? (
              <Link
                key={s.id}
                href={`/consultations/${s.booking.appointmentId}`}
                title="Booked — open the consultation"
                className="inline-flex items-center gap-2 border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 font-mono text-[12px] tracking-[-0.01em] text-[var(--paper)] hover:bg-[var(--ink-2)]"
              >
                {s.time.slice(0, 5)}
                <span className="text-[10px] uppercase tracking-[0.12em]">
                  Booked · {s.booking.childName}
                </span>
              </Link>
            ) : (
              <span
                key={s.id}
                className={`group inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-[12px] tracking-[-0.01em] ${
                  s.is_available
                    ? 'border-[var(--accent)] text-[var(--ink)]'
                    : 'border-[var(--hairline-strong)] text-[var(--ink-4)] line-through'
                }`}
              >
                {s.time.slice(0, 5)}
                <button
                  type="button"
                  onClick={() => run(() => toggleSlotAction(s.id, !s.is_available))}
                  disabled={pending}
                  aria-label={`${s.is_available ? 'Close' : 'Open'} ${s.time.slice(0, 5)} slot`}
                  className="text-[10px] uppercase tracking-[0.12em] no-underline hover:text-[var(--accent)]"
                >
                  {s.is_available ? 'Close' : 'Open'}
                </button>
                <button
                  type="button"
                  onClick={() => run(() => deleteSlotAction(s.id))}
                  disabled={pending}
                  aria-label={`Delete ${s.time.slice(0, 5)} slot`}
                  className="text-[10px] uppercase tracking-[0.12em] hover:text-[var(--alert)]"
                >
                  ✕
                </button>
              </span>
            ),
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 border-l-2 border-[var(--alert)] pl-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--alert)]">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
