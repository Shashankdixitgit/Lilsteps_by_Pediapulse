'use client';

import { useState, useTransition } from 'react';
import { generateSlotsAction } from './actions';

function todayIso() {
  // Clinic-local (IST) — same convention as page.tsx / actions.ts.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function GenerateForm({ defaultStartDate }: { defaultStartDate?: string }) {
  const [startDate, setStartDate] = useState(() => {
    const today = todayIso();
    return defaultStartDate && defaultStartDate > today ? defaultStartDate : today;
  });
  const [days, setDays] = useState(7);
  // Clinic hours: mornings 10–13, evenings 17–20.
  const [startHour, setStartHour] = useState(10);
  const [endHour, setEndHour] = useState(13);
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Clinic hours</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={startHour === p.start && endHour === p.end}
            onClick={() => {
              setStartHour(p.start);
              setEndHour(p.end);
            }}
            className={`editorial-btn-ghost btn-sm ${startHour === p.start && endHour === p.end ? '!border-[var(--ink)] !bg-[var(--accent-pale)]' : ''}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <Field label="Start date" htmlFor="gen-start-date">
          <input
            id="gen-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            min={todayIso()}
            className="editorial-input"
          />
        </Field>
        <Field label="Days to generate" htmlFor="gen-days">
          <input
            id="gen-days"
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value || '0', 10))}
            className="editorial-input"
          />
        </Field>
        <Field label="Start hour (24h)" htmlFor="gen-start-hour">
          <input
            id="gen-start-hour"
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(e) => setStartHour(parseInt(e.target.value || '0', 10))}
            className="editorial-input"
          />
        </Field>
        <Field label="End hour (24h)" htmlFor="gen-end-hour">
          <input
            id="gen-end-hour"
            type="number"
            min={1}
            max={24}
            value={endHour}
            onChange={(e) => setEndHour(parseInt(e.target.value || '0', 10))}
            className="editorial-input"
          />
        </Field>
        <Field label="Slot length" htmlFor="gen-interval">
          <select
            id="gen-interval"
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
          role={feedback.kind === 'err' ? 'alert' : 'status'}
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

const PRESETS = [
  { label: 'Morning 10–13', start: 10, end: 13 },
  { label: 'Evening 17–20', start: 17, end: 20 },
];

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  const cls = 'font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]';
  return (
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={cls}>
          {label}
        </label>
      ) : (
        <div className={cls}>{label}</div>
      )}
      <div className="mt-1">{children}</div>
    </div>
  );
}
