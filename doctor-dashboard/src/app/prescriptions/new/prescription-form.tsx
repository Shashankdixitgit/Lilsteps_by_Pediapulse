'use client';

import { useState, useTransition } from 'react';
import { createPrescriptionAction, type PrescriptionItemInput } from './actions';

interface Props {
  childId: string;
  childName: string;
  appointmentId: string | null;
}

function emptyItem(): PrescriptionItemInput {
  return { medicine: '', dose: '', frequency: '', duration: '', notes: '' };
}

export function PrescriptionForm({ childId, childName, appointmentId }: Props) {
  const [items, setItems] = useState<PrescriptionItemInput[]>([emptyItem()]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateItem(idx: number, patch: Partial<PrescriptionItemInput>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(idx: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }
  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createPrescriptionAction({
        childId,
        appointmentId,
        notes: notes.trim() || null,
        items,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-12 fade-up" style={{ animationDelay: '80ms' }}>
      <div className="space-y-8">
        {items.map((item, idx) => (
          <fieldset key={idx} className="border-t border-[var(--hairline)] pt-6">
            <legend className="float-left mr-4 -mt-3 bg-[var(--paper)] pr-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">
              ℞{idx + 1}
            </legend>
            <div className="flex items-baseline justify-between">
              <span className="font-display-italic text-[20px] text-[var(--ink)]">
                Medicine
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="link-underline font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)] hover:text-[var(--alert)]"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
              <FieldInput
                label="Drug name"
                value={item.medicine}
                onChange={(v) => updateItem(idx, { medicine: v })}
                placeholder="e.g. Paracetamol"
              />
              <FieldInput
                label="Dose"
                value={item.dose}
                onChange={(v) => updateItem(idx, { dose: v })}
                placeholder="e.g. 5ml / 250mg"
              />
              <FieldInput
                label="Frequency"
                value={item.frequency}
                onChange={(v) => updateItem(idx, { frequency: v })}
                placeholder="e.g. 3 times a day"
              />
              <FieldInput
                label="Duration"
                value={item.duration ?? ''}
                onChange={(v) => updateItem(idx, { duration: v })}
                placeholder="e.g. 5 days"
              />
            </div>

            <div className="mt-6">
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                Special instructions
              </label>
              <textarea
                value={item.notes ?? ''}
                onChange={(e) => updateItem(idx, { notes: e.target.value })}
                rows={2}
                placeholder="Take with food, etc."
                className="editorial-input mt-1 resize-none italic placeholder:not-italic"
              />
            </div>
          </fieldset>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="link-underline font-display-italic text-[18px] text-[var(--ink-2)] hover:text-[var(--accent)]"
        >
          + add another medicine
        </button>
      </div>

      <div>
        <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Doctor&apos;s note to {childName.split(' ')[0]}&apos;s parent
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything the parent should know about this prescription."
          className="editorial-input mt-1 resize-none italic placeholder:not-italic"
        />
      </div>

      {error && (
        <p className="border-l-2 border-[var(--alert)] pl-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--alert)]">
          {error}
        </p>
      )}

      <div className="flex justify-end border-t border-[var(--hairline)] pt-8">
        <button type="button" onClick={submit} disabled={pending} className="editorial-btn">
          {pending ? 'Issuing…' : 'Issue prescription'}
        </button>
      </div>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="editorial-input mt-1"
      />
    </div>
  );
}
