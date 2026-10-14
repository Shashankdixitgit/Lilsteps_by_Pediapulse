'use client';

import { useState, useTransition } from 'react';
import { openChatAction } from './actions';

/** Goes straight to the parent thread, creating it when none exists yet. */
export function OpenChatButton({ appointmentId }: { appointmentId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await openChatAction(appointmentId);
            if (res?.error) setError(res.error);
          })
        }
        className="editorial-btn-ghost"
      >
        {pending ? 'Opening…' : 'Open chat'}
      </button>
      {error && (
        <span role="alert" className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--alert)]">
          {error}
        </span>
      )}
    </>
  );
}
