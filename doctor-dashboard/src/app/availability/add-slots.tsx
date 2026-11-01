'use client';

import { useRef, useState } from 'react';
import { GenerateForm } from './generate-form';

/**
 * "Add slots" button that opens the slot generator in a side drawer (a
 * native modal dialog: focus stays inside, Esc and the backdrop close it).
 */
export function AddSlots({ defaultStartDate }: { defaultStartDate: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  // A fresh form (and start date) each time the drawer opens.
  const [openCount, setOpenCount] = useState(0);

  function open() {
    setOpenCount((n) => n + 1);
    ref.current?.showModal();
  }
  function close() {
    ref.current?.close();
  }

  return (
    <>
      <button type="button" onClick={open} className="editorial-btn">
        <span aria-hidden className="text-[17px] leading-none">+</span>
        Add slots
      </button>
      <dialog
        ref={ref}
        aria-labelledby="add-slots-title"
        onClick={(e) => {
          // A click on the backdrop lands on the dialog element itself.
          if (e.target === e.currentTarget) close();
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
            {openCount > 0 && <GenerateForm key={openCount} defaultStartDate={defaultStartDate} />}
          </div>
        </div>
      </dialog>
    </>
  );
}
