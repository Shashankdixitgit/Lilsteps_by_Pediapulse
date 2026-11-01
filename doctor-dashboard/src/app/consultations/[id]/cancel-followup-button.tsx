'use client';

import { useState, useTransition } from 'react';
import { cancelFollowupAction } from './actions';

/** Withdraws a follow-up the family has not paid for yet; the slot re-opens. */
export function CancelFollowupButton({ holdId, when }: { holdId: string; when: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    if (!confirm(`Cancel the follow-up on ${when}?\n\nThe payment link stops working and the time opens for booking again.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await cancelFollowupAction(holdId);
        if (res?.error) setError(res.error);
      } catch (e) {
        if (e && typeof e === 'object' && 'digest' in e) throw e;
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={cancel} disabled={pending} className="editorial-btn-ghost" style={{ color: 'var(--alert)' }}>
        {pending ? 'Cancelling…' : 'Cancel follow-up'}
      </button>
      {error && (
        <span role="alert" className="text-[13px] text-[var(--alert)]">
          {error}
        </span>
      )}
    </>
  );
}
