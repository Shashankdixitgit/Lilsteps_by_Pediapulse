'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { formatDayShort, formatSlotTime } from '@/lib/format';
import { deleteSlotAction, deleteSlotsForDateAction, toggleSlotAction } from './actions';

export interface DaySlots {
  date: string;
  items: {
    id: string;
    time: string;
    is_available: boolean;
    /** Set when a live appointment holds this slot — no toggle or delete. */
    booking: { appointmentId: string; childName: string; held: boolean; followup: boolean } | null;
  }[];
}

type Slot = DaySlots['items'][number];

/**
 * The selected day on the Availability page: open slots (each can be
 * closed), then everything that isn't open — booked and held slots (locked)
 * and closed ones (can be reopened or removed).
 */
export function SlotsDay({ day, title, isToday }: { day: DaySlots; title: string; isToday: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const open = day.items.filter((s) => s.is_available && !s.booking);
  const notOpen = day.items.filter((s) => !(s.is_available && !s.booking));
  // Paid consults and payment holds both keep their slot, but only paid ones are booked.
  const bookedCount = day.items.filter((s) => s.booking && !s.booking.held).length;
  const heldCount = day.items.filter((s) => s.booking?.held).length;
  const closedCount = notOpen.length - bookedCount - heldCount;
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
  function deleteSlot(s: Slot) {
    const time = formatSlotTime(s.time);
    if (!confirm(`Remove the ${time} slot on ${formatDayShort(day.date)}? Parents can no longer book it.`)) return;
    run(() => deleteSlotAction(s.id));
  }
  function clearDay() {
    const keep =
      lockedCount > 0 ? ` ${lockedCount} booked or held slot${lockedCount === 1 ? '' : 's'} will be kept.` : '';
    if (!confirm(`Remove ${clearable} slot${clearable === 1 ? '' : 's'} on ${formatDayShort(day.date)}?${keep}`)) return;
    run(() => deleteSlotsForDateAction(day.date));
  }

  const summary = [
    `${open.length} open`,
    bookedCount ? `${bookedCount} booked` : null,
    heldCount ? `${heldCount} held` : null,
    closedCount ? `${closedCount} closed` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div aria-busy={pending}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--hairline)] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          {isToday && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Today</div>
          )}
          <h2 className="font-display text-[24px] leading-tight text-[var(--ink)] sm:text-[26px]">{title}</h2>
          <p className="mt-1 text-[13px] text-[var(--ink-3)]">
            {day.items.length === 0 ? 'No slots on this day' : summary}
          </p>
        </div>
        {clearable > 0 && (
          <button
            type="button"
            onClick={clearDay}
            disabled={pending}
            className="text-[12.5px] font-medium text-[var(--ink-3)] underline decoration-dotted underline-offset-4 hover:text-[var(--alert)] disabled:opacity-50"
          >
            Clear day
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mx-5 mt-4 rounded-lg border border-[var(--alert)]/40 bg-[var(--peach)]/40 px-3 py-2 text-[13px] text-[var(--alert)] sm:mx-6"
        >
          {error}
        </p>
      )}

      {day.items.length === 0 ? (
        <div className="px-5 py-16 text-center sm:px-6">
          <p className="font-display text-[19px] text-[var(--ink-2)]">Nothing open on this day</p>
          <p className="mt-2 text-[14px] text-[var(--ink-3)]">Use “Add slots” to open times parents can book.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 px-5 py-5 sm:px-6 lg:grid-cols-2">
          <SlotGroup
            title="Open slots"
            hint="Parents can book these. You can close them."
            empty="No open slots. Reopen a closed one or add slots."
          >
            {open.map((s) => (
              <Row key={s.id} time={s.time} tone="open" status="Open">
                <button
                  type="button"
                  onClick={() => run(() => toggleSlotAction(s.id, false))}
                  disabled={pending}
                  aria-label={`Close the ${formatSlotTime(s.time)} slot`}
                  className="editorial-btn-ghost btn-sm"
                >
                  Close
                </button>
              </Row>
            ))}
          </SlotGroup>

          <SlotGroup title="Closed / booked" hint="Booked slots are locked. Closed ones can be reopened." empty="Nothing closed or booked.">
            {notOpen.map((s) =>
              s.booking?.followup ? (
                <Row key={s.id} time={s.time} tone="held" status="Follow-up · unpaid">
                  <Link
                    href={`/consultations/${s.booking.appointmentId}`}
                    title="A follow-up you booked. It opens again if the family doesn't pay."
                    className="link-underline min-w-0 truncate text-[13px] font-medium text-[var(--accent)]"
                  >
                    {s.booking.childName} →
                  </Link>
                </Row>
              ) : s.booking?.held ? (
                <Row key={s.id} time={s.time} tone="held" status="Held · family paying">
                  <span
                    className="hidden truncate text-[12.5px] text-[var(--ink-3)] sm:inline"
                    title="A family is paying for this slot. It opens again if they don't finish."
                  >
                    Opens again if unpaid
                  </span>
                </Row>
              ) : s.booking ? (
                <Row key={s.id} time={s.time} tone="booked" status="Booked">
                  <Link
                    href={`/consultations/${s.booking.appointmentId}`}
                    title="Booked — open the consultation"
                    className="link-underline min-w-0 truncate text-[13.5px] font-semibold text-[var(--ink)]"
                  >
                    {s.booking.childName} →
                  </Link>
                </Row>
              ) : (
                <Row key={s.id} time={s.time} tone="closed" status="Closed">
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => run(() => toggleSlotAction(s.id, true))}
                      disabled={pending}
                      aria-label={`Reopen the ${formatSlotTime(s.time)} slot`}
                      className="editorial-btn-ghost btn-sm"
                    >
                      Reopen
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSlot(s)}
                      disabled={pending}
                      aria-label={`Remove the ${formatSlotTime(s.time)} slot`}
                      title="Remove this slot"
                      className="grid h-8 w-8 place-items-center rounded-lg text-[14px] text-[var(--ink-3)] hover:bg-[var(--paper-soft)] hover:text-[var(--alert)] disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </span>
                </Row>
              ),
            )}
          </SlotGroup>
        </div>
      )}
    </div>
  );
}

function SlotGroup({
  title,
  hint,
  empty,
  children,
}: {
  title: string;
  hint: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h3>
        <span className="text-[12px] tabular-nums text-[var(--ink-3)]">{children.length}</span>
      </div>
      <p className="mt-0.5 text-[12.5px] text-[var(--ink-3)]">{hint}</p>
      {children.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--hairline-strong)] px-4 py-6 text-center text-[13px] text-[var(--ink-3)]">
          {empty}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--hairline)] overflow-hidden rounded-xl border border-[var(--hairline)]">
          {children}
        </ul>
      )}
    </section>
  );
}

const TONE: Record<'open' | 'booked' | 'held' | 'closed', { pill: string; row: string }> = {
  open: { pill: 'border-[var(--accent-soft)] bg-[var(--accent-pale)] text-[var(--accent)]', row: 'bg-[var(--card)]' },
  booked: { pill: 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]', row: 'bg-[var(--card)]' },
  held: { pill: 'border-dashed border-[var(--accent-soft)] bg-[var(--card)] text-[var(--accent)]', row: 'bg-[var(--card)]' },
  closed: { pill: 'border-[var(--hairline-strong)] bg-[var(--paper-soft)] text-[var(--ink-3)]', row: 'bg-[var(--paper)]' },
};

function Row({
  time,
  tone,
  status,
  children,
}: {
  time: string;
  tone: keyof typeof TONE;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <li className={`flex min-h-[3.25rem] items-center justify-between gap-3 px-4 py-2 ${TONE[tone].row}`}>
      <span className="flex shrink-0 items-center gap-3">
        <span
          className={`w-[4.5rem] shrink-0 whitespace-nowrap font-mono text-[14px] ${tone === 'closed' ? 'text-[var(--ink-3)]' : 'text-[var(--ink)]'}`}
        >
          {formatSlotTime(time)}
        </span>
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[tone].pill}`}>{status}</span>
      </span>
      <span className="flex min-w-0 items-center justify-end">{children}</span>
    </li>
  );
}
