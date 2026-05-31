'use client';

import { useState, useTransition } from 'react';
import { updateMeetLinkAction } from './actions';

export function MeetLinkForm({ initialLink }: { initialLink: string | null }) {
  const [link, setLink] = useState(initialLink ?? '');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateMeetLinkAction(link);
      if (res.error) setFeedback({ kind: 'err', msg: res.error });
      else setFeedback({ kind: 'ok', msg: link ? 'Saved' : 'Cleared' });
    });
  }

  return (
    <div className="space-y-5 fade-up" style={{ animationDelay: '60ms' }}>
      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Permanent video room URL
        </label>
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://meet.google.com/abc-defg-hij"
          className="editorial-input mt-1"
        />
        <p className="mt-2 font-display-italic text-[14px] text-[var(--ink-2)]">
          Create a meeting at{' '}
          <a
            href="https://meet.google.com/new"
            target="_blank"
            rel="noreferrer"
            className="link-underline text-[var(--accent)]"
          >
            meet.google.com/new
          </a>{' '}
          and paste the URL. Parents join the same room. Admit them from the
          Meet waiting room.
        </p>
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
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
