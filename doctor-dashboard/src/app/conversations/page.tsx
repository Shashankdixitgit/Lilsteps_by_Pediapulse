/**
 * /conversations: the list is in the layout; on a wide screen the right
 * pane asks the doctor to pick a thread (on a phone this pane is hidden).
 */
export default function ConversationsPage() {
  return (
    <div className="grid flex-1 place-items-center bg-[var(--paper)] px-8 text-center">
      <div className="max-w-xs">
        <div
          aria-hidden
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border-[1.5px] border-[var(--ink)] bg-[var(--lilac)] shadow-[2px_2px_0_var(--ink)]"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-[var(--ink)]">
            <path
              d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5V16h0a2 2 0 0 1-2-2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="mt-5 font-display text-[22px] text-[var(--ink)]">Select a conversation</h2>
        <p className="mt-2 text-[14px] leading-[1.5] text-[var(--ink-3)]">
          Pick a thread on the left to read it and reply. Urgent threads waiting on you are at the top.
        </p>
      </div>
    </div>
  );
}
