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
      className="shrink-0 border-t border-[var(--hairline)] bg-[var(--card)] px-3 pb-3 pt-2.5 sm:px-5"
    >
      {error && (
        <p role="alert" className="mb-2 rounded-lg border border-[var(--alert)]/40 bg-[var(--peach)]/40 px-3 py-1.5 text-[12.5px] text-[var(--alert)]">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a reply…"
          aria-label="Reply"
          maxLength={MAX_MESSAGE}
          readOnly={pending}
          rows={Math.min(6, Math.max(1, draft.split('\n').length))}
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-[var(--hairline-strong)] bg-[var(--paper)] px-4 py-2.5 text-[15px] leading-[1.45] text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--ink)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-soft)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          className="editorial-btn h-[2.75rem] shrink-0 !rounded-full"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>
      <div className="mt-1 flex justify-between gap-3 px-1 text-[11px] text-[var(--ink-4)]">
        <span className="hidden sm:inline">⌘/Ctrl + Enter to send</span>
        {draft.length > 3500 && (
          <span aria-live="polite" className={`ml-auto ${draft.length >= MAX_MESSAGE ? 'text-[var(--alert)]' : ''}`}>
            {draft.length} / {MAX_MESSAGE}
          </span>
        )}
      </div>
    </form>
  );
}
