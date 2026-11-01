'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { OpenSlot } from '@/lib/open-slots';
import { bookFollowupAction, rescheduleConsultAction } from './actions';

/** "Tue, 3 Nov" for a DB date (parsed at UTC noon so no time zone shifts it). */
function dayLabel(iso: string): { weekday: string; day: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
    day: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  };
}

/** "17:30:00" → "5:30 pm" */
function timeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

/**
 * Pick one of the doctor's own open slots (next 14 days, IST) to move an
 * upcoming consult to ('reschedule') or to book a paid follow-up into
 * ('followup'). The database re-checks everything on save.
 */
export function SlotPicker({
  mode,
  appointmentId,
  childFirstName,
  currentWhen,
  slots,
}: {
  mode: 'reschedule' | 'followup';
  appointmentId: string;
  childFirstName: string;
  /** Reschedule only: the consult's current time, e.g. "Tue, 3 Nov, 10:30 am". */
  currentWhen?: string;
  slots: OpenSlot[];
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const opener = useRef<HTMLButtonElement>(null);

  const days = useMemo(() => [...new Set(slots.map((s) => s.date))], [slots]);
  const activeDay = day ?? days[0] ?? null;
  const times = slots.filter((s) => s.date === activeDay);
  const picked = slots.find((s) => s.id === slotId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function close() {
    setOpen(false);
    setSlotId(null);
    setError(null);
    opener.current?.focus();
  }

  function save() {
    if (!picked) return;
    setError(null);
    startTransition(async () => {
      try {
        if (mode === 'reschedule') {
          const res = await rescheduleConsultAction(appointmentId, picked.id);
          if (res.error) return setError(res.error);
          setDone(`Moved to ${res.when}. The family has been told by email and in chat.`);
        } else {
          const res = await bookFollowupAction(appointmentId, picked.id);
          if (res.error) return setError(res.error);
          setDone(
            res.emailed
              ? `Follow-up held for ${res.when}. The family has been emailed a link to pay and confirm.`
              : `Follow-up held for ${res.when}. The family can pay from the Consult tab in the app (we couldn't email them).`,
          );
        }
        setOpen(false);
        setSlotId(null);
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  const title = mode === 'reschedule' ? `Move ${childFirstName}'s consult` : `Book a follow-up for ${childFirstName}`;
  const intro =
    mode === 'reschedule'
      ? `Now: ${currentWhen}. Pick a new time. There is no charge: the family's payment carries over, the video link stays the same, and they get an email and a note in chat.`
      : `Pick a time at least 2 hours from now. The family gets an email to pay the consult fee (₹449) to confirm it. The time is held for them for up to 24 hours, and released 1 hour before it starts if not paid.`;

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => {
          setDone(null);
          setOpen(true);
        }}
        className={mode === 'reschedule' ? 'editorial-btn-ghost' : 'editorial-btn'}
      >
        {mode === 'reschedule' ? 'Reschedule' : 'Book follow-up'}
      </button>
      {done && (
        <span role="status" className="text-[13px] text-[var(--ink-2)]">
          {done}
        </span>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(11,22,50,0.32)] p-0 sm:items-center sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`picker-title-${mode}`}
            className="fade-up max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-[var(--hairline)] bg-[var(--card)] p-6 shadow-[0_12px_40px_rgba(11,22,50,0.18)] sm:rounded-2xl"
          >
            <h2 id={`picker-title-${mode}`} className="font-display text-[22px] leading-tight text-[var(--ink)]">
              {title}
            </h2>
            <p className="mt-2 text-[14px] leading-[1.55] text-[var(--ink-2)]">{intro}</p>

            {days.length === 0 ? (
              <p className="mt-5 rounded-xl bg-[var(--paper-soft)] px-4 py-3 text-[14px] text-[var(--ink-2)]">
                You have no open times in the next 14 days. Open more times on the Availability page first.
              </p>
            ) : (
              <>
                <div className="mt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Day</div>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Day">
                  {days.map((d) => {
                    const l = dayLabel(d);
                    const active = d === activeDay;
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setDay(d);
                          setSlotId(null);
                        }}
                        className={`shrink-0 rounded-xl border px-3 py-2 text-left leading-tight transition-colors ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                            : 'border-[var(--hairline-strong)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--paper-soft)]'
                        }`}
                      >
                        <span className="block text-[12px] opacity-80">{l.weekday}</span>
                        <span className="block text-[14px] font-semibold">{l.day}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  Time (India time)
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Time">
                  {times.map((s) => {
                    const active = s.id === slotId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSlotId(s.id)}
                        className={`rounded-lg border px-2 py-2 font-mono text-[13.5px] transition-colors ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent-pale)] font-semibold text-[var(--accent)]'
                            : 'border-[var(--hairline-strong)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--paper-soft)]'
                        }`}
                      >
                        {timeLabel(s.time)}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {error && (
              <p role="alert" className="mt-4 border-l-2 border-[var(--alert)] pl-3 text-[13px] text-[var(--alert)]">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button type="button" onClick={close} disabled={pending} className="editorial-btn-ghost">
                Close
              </button>
              <button type="button" onClick={save} disabled={!picked || pending} className="editorial-btn">
                {pending
                  ? 'Saving…'
                  : picked
                    ? `${mode === 'reschedule' ? 'Move to' : 'Hold'} ${dayLabel(picked.date).day}, ${timeLabel(picked.time)}`
                    : 'Pick a time'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
