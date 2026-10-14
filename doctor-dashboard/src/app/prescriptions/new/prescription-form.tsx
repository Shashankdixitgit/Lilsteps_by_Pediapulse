'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { findAllergyClashes, type AllergyInput } from '@/lib/allergy-clash';
import { ALLERGIES_NOT_KNOWN_LABEL } from '@/lib/appointments';
import { createPrescriptionAction, type PrescriptionItemInput } from './actions';

interface Props {
  childId: string;
  childName: string;
  appointmentId: string | null;
  allergies: AllergyInput[];
  /** No allergy rows and the parent said "Not known yet": the clash check can't help. */
  allergiesNotKnown?: boolean;
  /** Prescriptions already issued for this appointment. */
  existingCount: number;
  /** The doctor has no registration number yet: issuing is refused until it is added in Settings. */
  registrationMissing?: boolean;
}

function emptyItem(): PrescriptionItemInput {
  return { medicine: '', dose: '', frequency: '', duration: '', notes: '' };
}

type RequiredField = 'medicine' | 'dose' | 'frequency';
const REQUIRED: RequiredField[] = ['medicine', 'dose', 'frequency'];
const missing = (it: PrescriptionItemInput, f: RequiredField) => !it[f].trim();

export function PrescriptionForm({ childId, childName, appointmentId, allergies, allergiesNotKnown, existingCount, registrationMissing }: Props) {
  const [items, setItems] = useState<PrescriptionItemInput[]>([emptyItem()]);
  const [notes, setNotes] = useState('');
  // Server / network error from the last submit; cleared as soon as the form changes.
  const [error, setError] = useState<string | null>(null);
  // Set when the server refused because the registration number is missing.
  const [needsRegistration, setNeedsRegistration] = useState(false);
  // Set by a submit attempt; the field check below is derived from the live
  // items, so its message disappears the moment every field is filled.
  const [showValidation, setShowValidation] = useState(false);
  const [pending, startTransition] = useTransition();
  // A second prescription for the same visit needs an explicit yes.
  const [confirmAnother, setConfirmAnother] = useState(false);
  const needsConfirm = existingCount > 0 && !confirmAnother;
  const firstName = childName.split(' ')[0];

  const incomplete = items.some((it) => REQUIRED.some((f) => missing(it, f)));
  const validationError = showValidation && incomplete ? 'Each medicine needs name, dose, and frequency' : null;
  const shownError = validationError ?? error;

  function updateItem(idx: number, patch: Partial<PrescriptionItemInput>) {
    setError(null);
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
    setShowValidation(true);
    if (incomplete) return;
    if (needsConfirm) {
      setError('Tick the box to confirm another prescription for this visit');
      return;
    }
    startTransition(async () => {
      const res = await createPrescriptionAction({
        childId,
        appointmentId,
        confirmAnother,
        notes: notes.trim() || null,
        items,
      });
      if (res?.error) {
        setError(res.error);
        setNeedsRegistration(Boolean(res.needsRegistration));
      }
    });
  }

  return (
    <div className="space-y-12 fade-up" style={{ animationDelay: '80ms' }}>
      <div className="space-y-8">
        {items.map((item, idx) => {
          const clashes = findAllergyClashes(item.medicine, allergies);
          const invalid = (f: RequiredField) => showValidation && missing(item, f);
          return (
          <fieldset key={idx} className="border-t border-[var(--hairline)] pt-6">
            <legend className="sr-only">Medicine {idx + 1}</legend>
            {/* The ℞ number sits in the header row (not a floated legend) so it never overlaps the title. */}
            <div className="flex items-baseline justify-between gap-4">
              <span className="flex items-baseline gap-3">
                <span aria-hidden className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">
                  ℞{idx + 1}
                </span>
                <span className="font-display-italic text-[20px] text-[var(--ink)]">Medicine</span>
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
                invalid={invalid('medicine')}
              />
              <FieldInput
                label="Dose"
                value={item.dose}
                onChange={(v) => updateItem(idx, { dose: v })}
                placeholder="e.g. 5ml / 250mg"
                invalid={invalid('dose')}
              />
              <FieldInput
                label="Frequency"
                value={item.frequency}
                onChange={(v) => updateItem(idx, { frequency: v })}
                placeholder="e.g. 3 times a day"
                invalid={invalid('frequency')}
              />
              <FieldInput
                label="Duration"
                value={item.duration ?? ''}
                onChange={(v) => updateItem(idx, { duration: v })}
                placeholder="e.g. 5 days"
              />
            </div>

            {allergiesNotKnown && item.medicine.trim() && (
              <div
                role="note"
                className="mt-5 border-l-[3px] border-[var(--ink)] bg-[var(--paper-soft)] px-4 py-3 text-[14px] leading-[1.5] text-[var(--ink)]"
              >
                <span className="font-semibold">⚠ {ALLERGIES_NOT_KNOWN_LABEL}.</span> The allergy check
                can&apos;t warn you for {firstName}.
              </div>
            )}

            {clashes.length > 0 && (
              <div
                role="alert"
                className="mt-5 border-l-[3px] border-[var(--ink)] bg-[var(--paper-soft)] px-4 py-3 text-[14px] leading-[1.5] text-[var(--ink)]"
              >
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
                  ⚠ Allergy check
                </div>
                <ul className="mt-1 space-y-1">
                  {clashes.map((c) => (
                    <li key={c.allergy}>
                      {firstName} has a recorded <span className="font-semibold">{c.allergy}</span> allergy
                      {c.severity && c.severity.toLowerCase() !== 'unknown' ? ` (${c.severity})` : ' (severity not recorded)'}. {c.reason}.
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[13px] text-[var(--ink-3)]">
                  Check before issuing. This does not stop the prescription.
                </p>
              </div>
            )}

            <div className="mt-6">
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                Special instructions
              </label>
              <textarea
                value={item.notes ?? ''}
                onChange={(e) => updateItem(idx, { notes: e.target.value })}
                rows={2}
                placeholder="Take with food, etc."
                className="editorial-input mt-1 resize-none"
              />
            </div>
          </fieldset>
          );
        })}

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
          onChange={(e) => {
            setError(null);
            setNotes(e.target.value);
          }}
          rows={3}
          placeholder="Anything the parent should know about this prescription."
          className="editorial-input mt-1 resize-none"
        />
      </div>

      {existingCount > 0 && (
        <label className="flex items-start gap-3 text-[14px] text-[var(--ink)]">
          <input
            type="checkbox"
            checked={confirmAnother}
            onChange={(e) => {
              setError(null);
              setConfirmAnother(e.target.checked);
            }}
            className="mt-1 h-4 w-4 accent-[var(--ink)]"
          />
          <span>
            Yes, issue another prescription for this visit ({existingCount} already issued).
          </span>
        </label>
      )}

      {shownError && (
        <p role="alert" className="border-l-2 border-[var(--alert)] pl-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--alert)]">
          {shownError}
          {shownError === error && needsRegistration && (
            <>
              {' '}
              <Link href="/settings" className="link-underline font-semibold">
                Open Settings
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex justify-end border-t border-[var(--hairline)] pt-8">
        {registrationMissing && (
          <p className="mr-auto self-center text-[13px] text-[var(--ink-3)]">
            Add your registration number in{' '}
            <Link href="/settings" className="link-underline">
              Settings
            </Link>{' '}
            first.
          </p>
        )}
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
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        {label}
        {invalid && <span className="ml-2 font-semibold text-[var(--alert)]">· required</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className="editorial-input mt-1"
        // Inline so it wins over the unlayered .editorial-input rule.
        style={invalid ? { borderBottomColor: 'var(--ink)', borderBottomWidth: 2 } : undefined}
      />
    </label>
  );
}
