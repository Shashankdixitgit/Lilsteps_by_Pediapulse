'use client';

import { useState, useTransition } from 'react';
import { generateSlotsAction } from './actions';

function todayIso() {
  // Clinic-local (IST) — same convention as page.tsx / actions.ts.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function GenerateForm() {
  const [startDate, setStartDate] = useState(todayIso());
  const [days, setDays] = useState(7);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [interval, setInterval] = useState<15 | 30 | 45 | 60>(30);
  const [skipSundays, setSkipSundays] = useState(true);

  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const res = await generateSlotsAction({
        startDate,
        days,
        startHour,
        endHour,
        intervalMinutes: interval,
        skipSundays,
      });
      if (res.error) setFeedback({ kind: 'err', msg: res.error });
      else setFeedback({ kind: 'ok', msg: `Generated ${res.inserted ?? 0} new slot${res.inserted === 1 ? '' : 's'}` });
    });
  }

  return (
    <div className="space-y-6 border-t border-[var(--hairline)] pt-6">
      <div>
        <h2 className="font-display text-[28px] leading-tight tracking-[-0.02em] text-[var(--ink)]">
          <span className="font-display-italic">Generate</span> a window
        </h2>
        <p className="mt-2 font-display-italic text-[15px] text-[var(--ink-2)]">
          Bulk-create slots for the next several days. Duplicates are skipped.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
        <Field label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            min={todayIso()}
            className="editorial-input"
          />
        </Field>
        <Field label="Days to generate">
          <input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value || '0', 10))}
            className="editorial-input"
          />
        </Field>
        <Field label="Start hour (24h)">
          <input
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(e) => setStartHour(parseInt(e.target.value || '0', 10))}
            className="editorial-input"
          />
        </Field>
        <Field label="End hour (24h)">
          <input
            type="number"
            min={1}
            max={24}
            value={endHour}
            onChange={(e) => setEndHour(parseInt(e.target.value || '0', 10))}
            className="editorial-input"
          />
        </Field>
        <Field label="Slot length">
          <select
            value={interval}
            onChange={(e) => setInterval(parseInt(e.target.value, 10) as 15 | 30 | 45 | 60)}
            className="editorial-input"
          >
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
          </select>
        </Field>
        <Field label="Skip Sundays">
          <label className="mt-3 flex items-center gap-2 font-sans text-[14px] text-[var(--ink)]">
            <input
              type="checkbox"
              checked={skipSundays}
              onChange={(e) => setSkipSundays(e.target.checked)}
              className="h-4 w-4"
            />
            Sunday is a clinic holiday
          </label>
        </Field>
      </div>

      {feedback && (
        <p
          className={`border-l-2 pl-3 font-mono text-[11px] uppercase tracking-[0.12em] ${
            feedback.kind === 'ok'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-[var(--alert)] text-[var(--alert)]'
          }`}
        >
          {feedback.msg}
        </p>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={pending} className="editorial-btn">
          {pending ? 'Generating…' : 'Generate slots'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
