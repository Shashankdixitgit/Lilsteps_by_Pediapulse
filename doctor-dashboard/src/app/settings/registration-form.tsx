'use client';

import { useState, useTransition } from 'react';
import { updateRegistrationAction } from './actions';

/** doctors.registration_number (0040): printed on the parent's prescription. */
export function RegistrationForm({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial ?? '');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateRegistrationAction(value);
      if (res.error) {
        setFeedback({ kind: 'err', msg: res.error });
        return;
      }
      setValue(res.registration ?? '');
      setFeedback({
        kind: 'ok',
        msg: res.registration
          ? 'Saved. It now shows on your prescriptions.'
          : 'Cleared. Prescriptions say the number is still to be added.',
      });
    });
  }

  return (
    <div className="space-y-5 fade-up" style={{ animationDelay: '60ms' }}>
      <div>
        <label
          htmlFor="registration-number"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
        >
          Medical council registration number
        </label>
        <input
          id="registration-number"
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={60}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="As on your council certificate, with the council name"
          className="editorial-input mt-1"
        />
        <p className="mt-2 text-[14px] leading-[1.55] text-[var(--ink-3)]">
          The telemedicine rules ask for this on every prescription. Parents see it with your
          name and qualifications.
        </p>
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
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
