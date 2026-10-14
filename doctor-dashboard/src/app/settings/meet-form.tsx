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
      if (res.error) {
        setFeedback({ kind: 'err', msg: res.error });
        return;
      }
      setLink(res.link ?? '');
      setFeedback({
        kind: 'ok',
        msg: res.link ? 'Saved. Parents will join this room.' : 'Cleared. Parents will see that no link is set yet.',
      });
    });
  }

  return (
    <div className="space-y-5 fade-up" style={{ animationDelay: '60ms' }}>
      <div>
        <label
          htmlFor="meet-link"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
        >
          Your Google Meet link
        </label>
        <input
          id="meet-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://meet.google.com/xxx-xxxx-xxx"
          className="editorial-input mt-1"
        />
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[14px] leading-[1.55] text-[var(--ink-3)]">
          <li>
            Open{' '}
            <a
              href="https://meet.google.com/new"
              target="_blank"
              rel="noreferrer"
              className="link-underline text-[var(--accent)]"
            >
              meet.google.com/new
            </a>{' '}
            while signed in to the Google account you use for consults.
          </li>
          <li>Copy the meeting link and paste it here. Keep using this one room.</li>
          <li>At consult time, open the same link and admit the parent from the waiting room.</li>
        </ol>
        <p className="mt-2 text-[14px] leading-[1.55] text-[var(--ink-3)]">
          Until a link is saved, parents are told you haven&apos;t added a video link yet, so
          they can message you instead.
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
