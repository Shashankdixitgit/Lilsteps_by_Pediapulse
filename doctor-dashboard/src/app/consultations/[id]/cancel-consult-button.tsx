'use client';

import { useState, useTransition } from 'react';
import { cancelConsultAction } from './actions';

/**
 * Cancels an upcoming consult for the doctor. The family gets a full refund
 * of a paid consult, the slot re-opens, and the parent is told in chat.
 */
export function CancelConsultButton({
  appointmentId,
  childFirstName,
  when,
}: {
  appointmentId: string;
  childFirstName: string;
  /** e.g. "Mon 2 Nov, 10:30 am" */
  when: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    if (
      !confirm(
        `Cancel ${childFirstName}'s consult on ${when}?\n\nThe family gets a full refund, the slot opens for booking again, and the parent is told in chat. This can't be undone.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      try {
        // Redirects to the queue on success; we only land here on an error.
        const res = await cancelConsultAction(appointmentId);
        if (res?.error) setError(res.error);
      } catch (e) {
        // redirect() is delivered as a thrown navigation; let Next handle it.
        if (e && typeof e === 'object' && 'digest' in e) throw e;
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={cancel} disabled={pending} className="editorial-btn-ghost"
        style={{ color: 'var(--alert)' }}
      >
        {pending ? 'Cancelling…' : 'Cancel consult'}
      </button>
      {error && (
        <span role="alert" className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--alert)]">
          {error}
        </span>
      )}
    </>
  );
}
