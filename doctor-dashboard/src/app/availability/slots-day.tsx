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
    booking: { appointmentId: string; childName: string; held: boolean } | null;
  }[];
}

export function SlotsDay({ day }: { day: DaySlots }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const d = dateStamp(day.date);
  const availableCount = day.items.filter((s) => s.is_available && !s.booking).length;
  // Paid consults and payment holds both keep their slot, but only paid ones are booked.
  const bookedCount = day.items.filter((s) => s.booking && !s.booking.held).length;
  const heldCount = day.items.filter((s) => s.booking?.held).length;
  const lockedCount = bookedCount + heldCount;
  const clearable = day.items.length - lockedCount;

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.error) setError(res.error);
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }
  function deleteSlot(id: string, time: string) {
    if (!confirm(`Delete the ${time} slot on ${formatDayShort(day.date)}? Parents can no longer book it.`)) return;
    run(() => deleteSlotAction(id));
  }
  function clearDay() {
    const keep =
      lockedCount > 0 ? ` ${lockedCount} booked or held slot${lockedCount === 1 ? '' : 's'} will be kept.` : '';
    if (!confirm(`Delete ${clearable} slot${clearable === 1 ? '' : 's'} on ${formatDayShort(day.date)}?${keep}`)) return;
    run(() => deleteSlotsForDateAction(day.date));
  }

  return (
    <li className="grid grid-cols-1 gap-3 border-t border-[var(--hairline)] py-5 sm:grid-cols-[6rem_1fr] sm:gap-6 sm:py-6">
      {/* Phone: one header line above the chips. sm+: a date column. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:block">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)] sm:block">
          {d.weekday} {d.month}
        </div>
        <div className="order-first font-display text-[24px] leading-[1] text-[var(--ink)] sm:order-none sm:text-[36px]">
          {d.day}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)] sm:mt-2">
          {availableCount}/{day.items.length} open
        </div>
        {lockedCount > 0 && (
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink)] sm:mt-1">
            {[bookedCount > 0 ? `${bookedCount} booked` : null, heldCount > 0 ? `${heldCount} held` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
        {clearable > 0 && (
          <button
            type="button"
            onClick={clearDay}
            disabled={pending}
            className="link-underline ml-auto font-mono sm:ml-0 sm:mt-3 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)] hover:text-[var(--alert)]"
          >
            Clear day
          </button>
        )}
      </div>

      <div>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {day.items.map((s) =>
            s.booking?.held ? (
              <span
                key={s.id}
                title="A family is paying for this slot. It opens again if they don't finish."
                className="inline-flex items-center gap-2 border border-dashed border-[var(--hairline-strong)] px-2 py-1 font-mono text-[12px] tracking-[-0.01em] text-[var(--ink-3)] sm:px-3 sm:py-1.5"
              >
                {s.time.slice(0, 5)}
                <span className="text-[10px] uppercase tracking-[0.12em]">Held · paying</span>
              </span>
            ) : s.booking ? (
              <Link
                key={s.id}
                href={`/consultations/${s.booking.appointmentId}`}
                title="Booked — open the consultation"
                className="inline-flex max-w-full items-center gap-2 border border-[var(--ink)] bg-[var(--ink)] px-2 py-1 font-mono sm:px-3 sm:py-1.5 text-[12px] tracking-[-0.01em] text-[var(--paper)] hover:bg-[var(--ink-2)]"
              >
                {s.time.slice(0, 5)}
                <span className="truncate text-[10px] uppercase tracking-[0.12em]">
                  Booked · {s.booking.childName}
                </span>
              </Link>
            ) : (
              // The chip says the state (Open / Closed); the small button
              // next to it is the action (Close / Reopen).
              <span
                key={s.id}
                className={`group inline-flex items-center gap-2 border px-2 py-1 font-mono text-[12px] tracking-[-0.01em] sm:px-3 sm:py-1.5 ${
                  s.is_available
                    ? 'border-[var(--accent)] bg-[var(--card)] text-[var(--ink)]'
                    : 'border-[var(--hairline-strong)] bg-[var(--paper-soft)] text-[var(--ink-3)]'
                }`}
              >
                {s.time.slice(0, 5)}
                <span
                  className={`text-[10px] uppercase tracking-[0.12em] ${
                    s.is_available ? 'text-[var(--accent)]' : 'text-[var(--ink-3)]'
                  }`}
                >
                  {s.is_available ? 'Open' : 'Closed'}
                </span>
                <span aria-hidden="true" className="text-[var(--hairline-strong)]">|</span>
                <button
                  type="button"
                  onClick={() => run(() => toggleSlotAction(s.id, !s.is_available))}
                  disabled={pending}
                  aria-label={`${s.is_available ? 'Close' : 'Reopen'} the ${s.time.slice(0, 5)} slot`}
                  className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-2)] underline decoration-dotted underline-offset-2 hover:text-[var(--accent)]"
                >
                  {s.is_available ? 'Close' : 'Reopen'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteSlot(s.id, s.time.slice(0, 5))}
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
