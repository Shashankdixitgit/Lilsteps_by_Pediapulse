'use client';

import { useRef, useState, useTransition } from 'react';
import { sendMessageAction } from './actions';

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
    setDraft('');
    startTransition(async () => {
      const result = await sendMessageAction(conversationId, content);
      if (result.error) {
        setError(result.error);
        setDraft(content);
      } else {
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
            rows={2}
            className="editorial-input resize-none italic placeholder:not-italic"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
          />
          <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-4)]">
            ⌘/Ctrl + Enter to send
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
        <p className="border-l-2 border-[var(--alert)] pl-3 pb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--alert)]">
          {error}
        </p>
      )}
    </form>
  );
}
