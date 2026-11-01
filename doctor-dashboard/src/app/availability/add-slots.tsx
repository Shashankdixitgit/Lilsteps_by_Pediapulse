'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { GenerateForm } from './generate-form';

/**
 * "Add slots" button that opens the slot generator in a side drawer (a
 * native modal dialog: focus stays inside, Esc and the backdrop close it).
 * After a successful run the drawer closes and the page jumps to the first
 * generated day, with the result shown next to the button.
 */
export function AddSlots({ defaultStartDate }: { defaultStartDate: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  // Where the last mousedown landed: a drag that starts inside the panel
  // and ends on the backdrop must not close it.
  const downOnBackdrop = useRef(false);
  // A fresh form (and start date) each time the drawer opens.
  const [openCount, setOpenCount] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  function open() {
    setDone(null);
    setOpenCount((n) => n + 1);
    ref.current?.showModal();
  }
  function close() {
    ref.current?.close();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {done && (
        <p role="status" className="text-[13px] font-medium text-[var(--accent)]">
          {done}
        </p>
      )}
      <button type="button" onClick={open} className="editorial-btn">
        <span aria-hidden className="text-[17px] leading-none">+</span>
        Add slots
      </button>
      <dialog
        ref={ref}
        aria-labelledby="add-slots-title"
        onMouseDown={(e) => {
          downOnBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          // A click on the backdrop lands on the dialog element itself.
          if (e.target === e.currentTarget && downOnBackdrop.current) close();
          downOnBackdrop.current = false;
        }}
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-md border-l border-[var(--hairline-strong)] bg-[var(--paper)] p-0 text-[var(--ink)] backdrop:bg-[rgba(11,22,50,0.28)] sm:max-w-[30rem]"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-5 py-5 sm:px-6">
            <div>
              <h2 id="add-slots-title" className="font-display text-[24px] leading-tight text-[var(--ink)]">
                Add slots
              </h2>
              <p className="mt-1 text-[13.5px] text-[var(--ink-3)]">
                Open slots for the next few days. Times you already have are skipped.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[18px] text-[var(--ink-3)] hover:bg-[var(--paper-soft)] hover:text-[var(--ink)]"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            {openCount > 0 && (
              <GenerateForm
                key={openCount}
                defaultStartDate={defaultStartDate}
                onGenerated={(startDate, message) => {
                  setDone(message);
                  close();
                  router.push(`/availability?d=${startDate}`);
                }}
              />
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}
