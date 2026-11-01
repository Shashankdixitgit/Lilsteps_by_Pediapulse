'use client';

import { useRef, useState, useTransition } from 'react';
import { sendMessageAction } from './actions';

const MAX_MESSAGE = 4000;

export function Composer({ conversationId }: { conversationId: string }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setError(null);
    startTransition(async () => {
      // Keep the draft until the send succeeds: a dropped connection rejects
      // the server action, and the doctor must not lose what they typed.
      let result: { error?: string };
      try {
        result = await sendMessageAction(conversationId, content);
      } catch {
        result = { error: "Couldn't send. Check your connection and try again." };
      }
      if (result.error) {
        setError(result.error);
      } else {
        setDraft('');
        textareaRef.current?.focus();
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-0 border-t border-[var(--hairline)] bg-[var(--paper)]/95 backdrop-blur-sm"
    >
      <div className="flex items-end gap-4 py-5">
        <div className="flex-1">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
            Reply
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="A reply, in your own words…"
            aria-label="Reply"
            maxLength={MAX_MESSAGE}
            readOnly={pending}
            rows={2}
            className="editorial-input resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
          />
          <div className="mt-1.5 flex justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-4)]">
            <span>⌘/Ctrl + Enter to send</span>
            {draft.length > 3500 && (
              <span aria-live="polite" className={draft.length >= MAX_MESSAGE ? 'text-[var(--alert)]' : undefined}>
                {draft.length} / {MAX_MESSAGE}
              </span>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          className="editorial-btn shrink-0"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>
      {error && (
        <p role="alert" className="border-l-2 border-[var(--alert)] pl-3 pb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--alert)]">
          {error}
        </p>
      )}
    </form>
  );
}
