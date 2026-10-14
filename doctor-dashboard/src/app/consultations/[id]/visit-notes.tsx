'use client';

import { useEffect, useState, useTransition } from 'react';
import type { VisitNotes } from '@/lib/consultations';
import { formatClock, formatSlotTime, relativeDayLabel, formatDayShort } from '@/lib/format';
import { saveVisitAction, type VisitOutcome } from './actions';

interface Props {
  appointmentId: string;
  status: 'upcoming' | 'completed' | 'cancelled' | 'no_show';
  initial: VisitNotes;
  childFirstName: string;
  /** Slot date (YYYY-MM-DD) and time (HH:MM[:SS]), clinic time (IST). */
  slotDate: string;
  slotTime: string;
}

/** True while the slot's start (IST, +05:30) is still ahead of now. */
function slotInFuture(date: string, time: string): boolean {
  const start = Date.parse(`${date}T${time.slice(0, 5)}:00+05:30`);
  return Number.isFinite(start) && start > Date.now();
}

// Drafts live in this browser only: the parent app shows every consultations
// row as a past visit, so nothing is written to the database until the visit
// is closed.
const draftKey = (id: string) => `lilsteps.visit-draft.${id}`;

function readDraft(id: string): VisitNotes | null {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as VisitNotes) : null;
  } catch {
    return null;
  }
}
function writeDraft(id: string, notes: VisitNotes | null) {
  try {
    if (notes) window.localStorage.setItem(draftKey(id), JSON.stringify(notes));
    else window.localStorage.removeItem(draftKey(id));
  } catch {
    /* storage blocked — the draft just isn't kept */
  }
}

export function VisitNotesForm({ appointmentId, status, initial, childFirstName, slotDate, slotTime }: Props) {
  const [notes, setNotes] = useState<VisitNotes>(initial);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<VisitOutcome | null>(null);
  const closed = status === 'completed' || status === 'no_show';

  // Restore an unsent draft for an open visit (client-only, after hydration).
  useEffect(() => {
    if (closed) return;
    const draft = readDraft(appointmentId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft) setNotes(draft);
  }, [appointmentId, closed]);

  if (status === 'cancelled') {
    return (
      <p className="text-[15px] text-[var(--ink-3)]">
        The parent cancelled this appointment, so there is nothing to record.
      </p>
    );
  }

  function submit(outcome: VisitOutcome) {
    if (outcome === 'no_show' && !confirm(`Mark ${childFirstName} as a no-show? The visit leaves your queue.`)) return;
    if (outcome === 'completed' && slotInFuture(slotDate, slotTime)) {
      const when = `${relativeDayLabel(slotDate) ?? formatDayShort(slotDate)} at ${formatSlotTime(slotTime)}`;
      if (!confirm(`${childFirstName}'s visit is booked for ${when}, which hasn't started yet. Mark it complete now? The parent will see it as a past visit.`)) return;
    }
    setError(null);
    setBusy(outcome);
    startTransition(async () => {
      if (outcome !== 'update') writeDraft(appointmentId, null);
      // complete / no-show redirect to the queue; we only land here on update or error.
      const res = await saveVisitAction({ appointmentId, notes, outcome });
      if (res?.error) {
        setError(res.error);
        if (outcome !== 'update') writeDraft(appointmentId, notes);
      } else if (res?.savedAt) setSavedAt(res.savedAt);
      setBusy(null);
    });
  }

  const set = (patch: Partial<VisitNotes>) => {
    setSavedAt(null);
    setNotes((n) => {
      const next = { ...n, ...patch };
      if (!closed) writeDraft(appointmentId, next);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-[14px] leading-[1.55] text-[var(--ink-3)]">
        {closed
          ? `${childFirstName}'s parent sees these notes in the app under “Visit summary”.`
          : `When you close the visit, ${childFirstName}'s parent sees these notes in the app under “Visit summary”. Until then they stay in this browser as a draft.`}
      </p>
      <NoteField
        label="Diagnosis"
        value={notes.diagnosis}
        onChange={(v) => set({ diagnosis: v })}
        placeholder="e.g. Viral upper respiratory infection"
        rows={2}
      />
      <NoteField
        label="Advice"
        value={notes.advice}
        onChange={(v) => set({ advice: v })}
        placeholder="Fluids, rest, paracetamol if temperature is above 38.5 °C…"
        rows={3}
      />
      <NoteField
        label="Follow-up"
        value={notes.followUp}
        onChange={(v) => set({ followUp: v })}
        placeholder="e.g. Review in 3 days if the fever continues"
        rows={2}
      />

      {error && (
        <p role="alert" className="border-l-2 border-[var(--alert)] pl-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--alert)]">
          {error}
        </p>
      )}
      {savedAt && !error && (
        <p role="status" className="border-l-2 border-[var(--accent)] pl-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--accent)]">
          Saved at {formatClock(savedAt)}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--hairline)] pt-6">
        {closed ? (
          <button type="button" onClick={() => submit('update')} disabled={pending} className="editorial-btn">
            {busy === 'update' ? 'Saving…' : 'Update notes'}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => submit('no_show')} disabled={pending} className="editorial-btn-ghost">
              {busy === 'no_show' ? 'Saving…' : 'No-show'}
            </button>
            <button type="button" onClick={() => submit('completed')} disabled={pending} className="editorial-btn">
              {busy === 'completed' ? 'Completing…' : 'Mark complete'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function NoteField({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows: number;
}) {
  const id = `visit-${label.toLowerCase().replace(/[^a-z]/g, '')}`;
  return (
    <div>
      <label htmlFor={id} className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={2000}
        placeholder={placeholder}
        className="editorial-input mt-1 resize-y"
      />
    </div>
  );
}
