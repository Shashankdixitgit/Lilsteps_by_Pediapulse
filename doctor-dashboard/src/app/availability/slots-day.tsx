'use client';

import { useTransition } from 'react';
import { deleteSlotAction, deleteSlotsForDateAction, toggleSlotAction } from './actions';

export interface DaySlots {
  date: string;
  items: { id: string; time: string; is_available: boolean }[];
}

function formatDate(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: d.toLocaleDateString('en-US', { day: '2-digit' }),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

export function SlotsDay({ day }: { day: DaySlots }) {
  const [pending, startTransition] = useTransition();
  const d = formatDate(day.date);
  const availableCount = day.items.filter((s) => s.is_available).length;

  function toggle(id: string, current: boolean) {
    startTransition(async () => {
      await toggleSlotAction(id, !current);
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      await deleteSlotAction(id);
    });
  }
  function clearDay() {
    if (!confirm(`Delete all ${day.items.length} slots on ${day.date}?`)) return;
    startTransition(async () => {
      await deleteSlotsForDateAction(day.date);
    });
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
        <button
          type="button"
          onClick={clearDay}
          disabled={pending}
          className="link-underline mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)] hover:text-[var(--alert)]"
        >
          Clear day
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {day.items.map((s) => (
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
              onClick={() => toggle(s.id, s.is_available)}
              disabled={pending}
              className="text-[10px] uppercase tracking-[0.12em] hover:text-[var(--accent)]"
            >
              {s.is_available ? 'Close' : 'Open'}
            </button>
            <button
              type="button"
              onClick={() => remove(s.id)}
              disabled={pending}
              className="text-[10px] uppercase tracking-[0.12em] hover:text-[var(--alert)]"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </li>
  );
}
