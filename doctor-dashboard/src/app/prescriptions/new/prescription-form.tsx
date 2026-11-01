'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { allergyCheckText, findAllergyClashes, type AllergyInput } from '@/lib/allergy-clash';
import { ALLERGIES_NOT_KNOWN_LABEL } from '@/lib/appointments';
import { doseHint } from '@/lib/dose-hint';
import { formatDate } from '@/lib/format';
import {
  DURATION_SUGGESTIONS,
  FREQUENCY_SUGGESTIONS,
  ROUTE_OPTIONS,
  RX_LIMITS,
  TIMING_OPTIONS,
  rxUpper,
  validatePrescription,
  type RxHeaderDraft,
  type RxItemDraft,
  type RxRequiredItemField,
} from '@/lib/prescription-limits';
import type { SavedMedicine } from '@/lib/saved-medicines';
import { PrescriptionCard, type PrescriptionCardData } from '../prescription-card';
import { createPrescriptionAction, deleteSavedMedicineAction, saveMedicineAction } from './actions';

interface Props {
  /** Read-only patient card (name, sex, DOB, age, weight, allergies), rendered by the page. */
  patientHeader: ReactNode;
  childId: string;
  child: { name: string; dob: string };
  /** Latest weight (growth chart, else profile), for the dose check. */
  weightKg: number | null;
  appointmentId: string | null;
  allergies: AllergyInput[];
  /** No allergy rows and the parent said "Not known yet": the clash check can't help. */
  allergiesNotKnown?: boolean;
  /** Prescriptions already issued for this appointment. */
  existingCount: number;
  /** The doctor has no registration number yet: issuing is refused until it is added in Settings. */
  registrationMissing?: boolean;
  /** As printed on the prescription (create_prescription snapshots the same doctors row). */
  doctor: { name: string; qualifications: string | null; registrationNumber: string | null };
  /** IST calendar day, YYYY-MM-DD. */
  today: string;
  /** Server time when the page was rendered (ISO), for the preview's "Issued" line. */
  now: string;
  /** The doctor's saved medicines; null when the table is not there yet (before migration 0055). */
  savedMedicines: SavedMedicine[] | null;
}

type Row = RxItemDraft & { key: string };

let keySeq = 0;
const nextKey = () => `rx${++keySeq}`;

function emptyItem(): Row {
  return {
    key: nextKey(),
    medicine: '',
    brand: '',
    strength: '',
    dose: '',
    frequency: '',
    duration: '',
    route: '',
    timing: '',
    notes: '',
  };
}

const isBlank = (it: RxItemDraft) =>
  !it.medicine.trim() && !it.dose.trim() && !it.frequency.trim() && !it.duration.trim() && !it.strength.trim();

const REQUIRED: RxRequiredItemField[] = ['medicine', 'dose', 'frequency', 'duration'];

/** YYYY-MM-DD plus n days (calendar arithmetic, no time zone involved). */
function plusDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const FOLLOW_UP_PRESETS = [2, 3, 5, 7, 14] as const;

const ADVICE_SNIPPETS = [
  'Plenty of fluids; small, frequent feeds.',
  'Normal diet as tolerated.',
  'Sponge with lukewarm water if fever is high.',
  'Come back at once if: fast or difficult breathing, not feeding or drinking, very drowsy or hard to wake, fits, fever beyond 3 days, or a new rash.',
] as const;

export function PrescriptionForm({
  patientHeader,
  childId,
  child,
  weightKg,
  appointmentId,
  allergies,
  allergiesNotKnown,
  existingCount,
  registrationMissing,
  doctor,
  today,
  now,
  savedMedicines,
}: Props) {
  const [items, setItems] = useState<Row[]>(() => [emptyItem()]);
  const [header, setHeader] = useState<RxHeaderDraft>({
    chiefComplaints: '',
    examination: '',
    diagnosis: '',
    advice: '',
    followUpDate: '',
    followUpText: '',
  });
  const [saved, setSaved] = useState<SavedMedicine[]>(savedMedicines ?? []);
  const [savedQuery, setSavedQuery] = useState('');
  // Per-row feedback from "Save to my medicines".
  const [rowNote, setRowNote] = useState<Record<string, string>>({});
  const [savedError, setSavedError] = useState<string | null>(null);
  // Server / network error from the last submit; cleared as soon as the form changes.
  const [error, setError] = useState<string | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  // Set by a submit attempt; the checks below are derived from the live form.
  const [showValidation, setShowValidation] = useState(false);
  const [pending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // A second prescription for the same visit needs an explicit yes.
  const [confirmAnother, setConfirmAnother] = useState(false);
  const needsConfirm = existingCount > 0 && !confirmAnother;
  const firstName = child.name.split(' ')[0];

  const validation = validatePrescription(header, items, today);
  const shownError = (showValidation ? validation : null) ?? error;

  function setH(patch: Partial<RxHeaderDraft>) {
    setError(null);
    setHeader((prev) => ({ ...prev, ...patch }));
  }
  function updateItem(key: string, patch: Partial<RxItemDraft>) {
    setError(null);
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function addItem(from?: RxItemDraft) {
    setError(null);
    const row: Row = from ? { ...emptyItem(), ...stripId(from), key: nextKey() } : emptyItem();
    // Adding a saved medicine fills the empty first row instead of leaving it blank.
    setItems((prev) =>
      from && prev.length === 1 && isBlank(prev[0]) ? [row] : prev.length >= RX_LIMITS.items ? prev : [...prev, row],
    );
  }
  function removeItem(key: string) {
    setItems((prev) => (prev.length === 1 ? [emptyItem()] : prev.filter((it) => it.key !== key)));
  }
  function moveItem(key: string, by: -1 | 1) {
    setItems((prev) => {
      const i = prev.findIndex((it) => it.key === key);
      const j = i + by;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function appendAdvice(line: string) {
    setH({ advice: header.advice.trim() ? `${header.advice.trimEnd()}\n${line}` : line });
  }

  async function saveRow(row: Row) {
    setSavingKey(row.key);
    setRowNote((n) => ({ ...n, [row.key]: '' }));
    const res = await saveMedicineAction(stripId(row));
    setSavingKey(null);
    if (res.saved) {
      setSaved((prev) => [res.saved!, ...prev]);
      setRowNote((n) => ({ ...n, [row.key]: 'Saved to your medicines' }));
    } else {
      setRowNote((n) => ({ ...n, [row.key]: res.error ?? 'Could not save' }));
    }
  }
  async function removeSaved(id: string) {
    setSavedError(null);
    const before = saved;
    setSaved((prev) => prev.filter((s) => s.id !== id));
    const res = await deleteSavedMedicineAction(id);
    if (res.error) {
      setSaved(before);
      setSavedError(res.error);
    }
  }

  function submit() {
    setError(null);
    setShowValidation(true);
    if (validation) return;
    if (needsConfirm) {
      setError('Tick the box to confirm another prescription for this visit');
      return;
    }
    startTransition(async () => {
      const res = await createPrescriptionAction({
        childId,
        appointmentId,
        confirmAnother,
        header,
        items: items.map(stripId),
      });
      if (res?.error) {
        setError(res.error);
        setNeedsRegistration(Boolean(res.needsRegistration));
      }
    });
  }

  const filteredSaved = useMemo(() => {
    const q = savedQuery.trim().toLowerCase();
    if (!q) return saved;
    return saved.filter((s) => [s.medicine, s.brand, s.strength].some((v) => v.toLowerCase().includes(q)));
  }, [saved, savedQuery]);

  // The live preview: the same card the records pages show once it is issued.
  const draft: PrescriptionCardData = {
    id: 'preview',
    issued_at: now,
    notes: null,
    appointment_id: appointmentId,
    doctor_name: doctor.name,
    qualifications: doctor.qualifications,
    registration_number: doctor.registrationNumber,
    chief_complaints: header.chiefComplaints.trim() || null,
    examination: header.examination.trim() || null,
    diagnosis: header.diagnosis.trim() || null,
    advice: header.advice.trim() || null,
    follow_up_date: header.followUpDate || null,
    follow_up_text: header.followUpText.trim() || null,
    prescription_items: items
      .filter((it) => it.medicine.trim())
      .map((it, i) => ({
        id: it.key,
        position: i,
        medicine: rxUpper(it.medicine),
        brand: it.brand.trim() || null,
        strength: it.strength.trim() || null,
        dose: it.dose.trim(),
        frequency: it.frequency.trim(),
        duration: it.duration.trim() || null,
        route: it.route || null,
        timing: it.timing || null,
        notes: it.notes.trim() || null,
      })),
  };
  const preview = (
    <PrescriptionCard rx={draft} child={{ name: child.name, dob: child.dob }} linkConsult={false} preview />
  );

  const diagnosisInvalid = showValidation && !header.diagnosis.trim();

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] fade-up" style={{ animationDelay: '60ms' }}>
      <div className="min-w-0 space-y-6">
        {patientHeader}

        {/* ── Clinical note ─────────────────────────────────────────── */}
        <Section title="Clinical note" hint="Telemedicine Practice Guidelines 2020: no medicine without a diagnosis or provisional diagnosis.">
          <div className="space-y-5">
            <Area
              id="rx-complaints"
              label="Chief complaints"
              value={header.chiefComplaints}
              onChange={(v) => setH({ chiefComplaints: v })}
              placeholder="e.g. Fever for 2 days, cough, reduced appetite"
              maxLength={RX_LIMITS.chiefComplaints}
              rows={2}
            />
            <Area
              id="rx-exam"
              label="Examination findings"
              optional
              value={header.examination}
              onChange={(v) => setH({ examination: v })}
              placeholder="e.g. Temp 101°F, throat congested, chest clear, RR 28/min"
              maxLength={RX_LIMITS.examination}
              rows={2}
            />
            <Area
              id="rx-diagnosis"
              label="Diagnosis / provisional diagnosis"
              required
              invalid={diagnosisInvalid}
              value={header.diagnosis}
              onChange={(v) => setH({ diagnosis: v })}
              placeholder="e.g. Acute pharyngitis (provisional)"
              maxLength={RX_LIMITS.diagnosis}
              rows={2}
            />
          </div>
        </Section>

        {/* ── Medicines ─────────────────────────────────────────────── */}
        <Section
          title={
            <span className="flex items-baseline gap-2">
              <span aria-hidden className="font-display text-[22px] leading-none text-[var(--accent)]">℞</span>
              Medicines
            </span>
          }
          aside={<span className="font-mono text-[12px] text-[var(--ink-3)]">{items.length} / {RX_LIMITS.items}</span>}
          hint="Generic names, printed in capitals. Add the brand only if the family needs it."
        >
          {savedMedicines !== null && (
            <details className="group mb-5 rounded-xl border border-[var(--hairline)] bg-[var(--paper)]" open={saved.length > 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px] font-semibold text-[var(--ink)]">
                <span>
                  ☆ My saved medicines{' '}
                  <span className="font-mono text-[12px] font-normal text-[var(--ink-3)]">({saved.length})</span>
                </span>
                <span aria-hidden className="text-[12px] text-[var(--ink-3)] transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="border-t border-[var(--hairline)] px-4 py-3">
                {saved.length === 0 ? (
                  <p className="text-[13px] leading-[1.5] text-[var(--ink-3)]">
                    Nothing saved yet. Fill in a medicine below and press <span className="font-semibold">Save to my medicines</span> to
                    reuse it in one click next time.
                  </p>
                ) : (
                  <>
                    <label className="block">
                      <span className="sr-only">Search saved medicines</span>
                      <input
                        type="search"
                        value={savedQuery}
                        onChange={(e) => setSavedQuery(e.target.value)}
                        placeholder="Search saved medicines"
                        className="w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--ink)] focus:outline-none"
                      />
                    </label>
                    <ul className="mt-2 max-h-64 divide-y divide-[var(--hairline)] overflow-y-auto">
                      {filteredSaved.map((s) => (
                        <li key={s.id} className="flex items-center gap-3 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-semibold text-[var(--ink)]">
                              {s.medicine}
                              {s.brand && <span className="font-normal text-[var(--ink-3)]"> ({s.brand})</span>}
                            </div>
                            <div className="truncate text-[12px] text-[var(--ink-3)]">
                              {[s.strength, s.dose, s.frequency, s.duration, s.timing].filter(Boolean).join(' · ') || 'No dose saved'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => addItem(s)}
                            className="editorial-btn btn-sm"
                            aria-label={`Add ${s.medicine} to this prescription`}
                          >
                            + Add
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSaved(s.id)}
                            className="rounded-md px-2 py-1 text-[13px] text-[var(--ink-3)] hover:bg-[var(--paper-soft)] hover:text-[var(--alert)]"
                            aria-label={`Remove ${s.medicine} from saved medicines`}
                            title="Remove from saved"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                      {filteredSaved.length === 0 && (
                        <li className="py-2 text-[13px] text-[var(--ink-3)]">No saved medicine matches “{savedQuery}”.</li>
                      )}
                    </ul>
                  </>
                )}
                {savedError && (
                  <p role="alert" className="mt-2 text-[13px] text-[var(--alert)]">
                    {savedError}
                  </p>
                )}
              </div>
            </details>
          )}

          <ol className="space-y-4">
            {items.map((item, idx) => {
              // Generic name and brand, so a brand-only allergy entry is caught too.
              const clashes = findAllergyClashes(allergyCheckText(item.medicine, item.brand), allergies);
              const invalid = (f: RxRequiredItemField) => showValidation && REQUIRED.includes(f) && !item[f].trim();
              const hint = doseHint(item.dose, item.strength, weightKg);
              const id = (f: string) => `rx-${idx}-${f}`;
              return (
                <li key={item.key}>
                  <fieldset className="rounded-xl border border-[var(--hairline-strong)] bg-[var(--card)]">
                    <legend className="sr-only">Medicine {idx + 1}</legend>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] px-4 py-2.5">
                      <span className="flex items-baseline gap-2">
                        <span className="font-mono text-[13px] font-semibold text-[var(--accent)]">{idx + 1}.</span>
                        <span className="text-[14px] font-semibold text-[var(--ink)]">
                          {item.medicine.trim() ? rxUpper(item.medicine) : 'Medicine'}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <IconBtn label={`Move medicine ${idx + 1} up`} disabled={idx === 0} onClick={() => moveItem(item.key, -1)}>
                          ↑
                        </IconBtn>
                        <IconBtn
                          label={`Move medicine ${idx + 1} down`}
                          disabled={idx === items.length - 1}
                          onClick={() => moveItem(item.key, 1)}
                        >
                          ↓
                        </IconBtn>
                        <IconBtn label={`Remove medicine ${idx + 1}`} onClick={() => removeItem(item.key)} danger>
                          ✕
                        </IconBtn>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2">
                      <Field
                        id={id('medicine')}
                        label="Generic name"
                        required
                        invalid={invalid('medicine')}
                        value={item.medicine}
                        onChange={(v) => updateItem(item.key, { medicine: v })}
                        placeholder="e.g. PARACETAMOL"
                        maxLength={RX_LIMITS.medicine}
                      />
                      <Field
                        id={id('brand')}
                        label="Brand"
                        optional
                        value={item.brand}
                        onChange={(v) => updateItem(item.key, { brand: v })}
                        placeholder="e.g. Calpol"
                        maxLength={RX_LIMITS.brand}
                      />
                      <Field
                        id={id('strength')}
                        label="Form & strength"
                        value={item.strength}
                        onChange={(v) => updateItem(item.key, { strength: v })}
                        placeholder="e.g. Syrup 250 mg/5 ml"
                        maxLength={RX_LIMITS.strength}
                      />
                      <div>
                        <Field
                          id={id('dose')}
                          label="Dose"
                          required
                          invalid={invalid('dose')}
                          value={item.dose}
                          onChange={(v) => updateItem(item.key, { dose: v })}
                          placeholder="e.g. 5 ml or 250 mg"
                          maxLength={RX_LIMITS.dose}
                        />
                        <p className="mt-1 text-[12px] leading-[1.4] text-[var(--ink-3)]" aria-live="polite">
                          {hint ? (
                            <>
                              <span className="font-semibold text-[var(--accent)]">{hint}</span> · check against the usual range
                            </>
                          ) : weightKg ? (
                            // No hint when the dose can't be read with confidence (".5 ml",
                            // "2,5 ml", "15 mg/kg", combination strengths): say so plainly.
                            item.dose.trim()
                              ? `Weight ${weightKg} kg · mg/kg not worked out for this dose, check it yourself`
                              : `Weight ${weightKg} kg`
                          ) : (
                            'Weight not recorded: confirm it before weight-based dosing'
                          )}
                        </p>
                      </div>
                      <Field
                        id={id('frequency')}
                        label="Frequency"
                        required
                        invalid={invalid('frequency')}
                        value={item.frequency}
                        onChange={(v) => updateItem(item.key, { frequency: v })}
                        placeholder="e.g. 3 times a day"
                        maxLength={RX_LIMITS.frequency}
                        list="rx-frequency-options"
                      />
                      <Field
                        id={id('duration')}
                        label="Duration"
                        required
                        invalid={invalid('duration')}
                        value={item.duration}
                        onChange={(v) => updateItem(item.key, { duration: v })}
                        placeholder="e.g. 5 days"
                        maxLength={RX_LIMITS.duration}
                        list="rx-duration-options"
                      />
                      <Select
                        id={id('route')}
                        label="Route"
                        value={item.route}
                        onChange={(v) => updateItem(item.key, { route: v })}
                        options={ROUTE_OPTIONS}
                      />
                      <Select
                        id={id('timing')}
                        label="Timing"
                        value={item.timing}
                        onChange={(v) => updateItem(item.key, { timing: v })}
                        options={TIMING_OPTIONS}
                      />
                      <div className="sm:col-span-2">
                        <Field
                          id={id('notes')}
                          label="Instructions for this medicine"
                          optional
                          value={item.notes}
                          onChange={(v) => updateItem(item.key, { notes: v })}
                          placeholder="e.g. Only if temperature is above 100°F; shake well"
                          maxLength={RX_LIMITS.itemNotes}
                        />
                      </div>
                    </div>

                    {allergiesNotKnown && (item.medicine.trim() || item.brand.trim()) && (
                      <div
                        role="note"
                        style={{ borderLeftColor: 'var(--ink)' }}
                        className="mx-4 mb-4 rounded-lg border-l-[3px] bg-[var(--paper-soft)] px-4 py-3 text-[14px] leading-[1.5] text-[var(--ink)]"
                      >
                        <span className="font-semibold">⚠ {ALLERGIES_NOT_KNOWN_LABEL}.</span> The allergy check can&apos;t warn
                        you for {firstName}.
                      </div>
                    )}

                    {clashes.length > 0 && (
                      <div
                        role="alert"
                        style={{ borderLeftColor: 'var(--alert)' }}
                        className="mx-4 mb-4 rounded-lg border-l-[3px] bg-[var(--peach)] px-4 py-3 text-[14px] leading-[1.5] text-[var(--ink)]"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--alert)]">⚠ Allergy check</div>
                        <ul className="mt-1 space-y-1">
                          {clashes.map((c) => (
                            <li key={c.allergy}>
                              {firstName} has a recorded <span className="font-semibold">{c.allergy}</span> allergy
                              {c.severity && c.severity.toLowerCase() !== 'unknown' ? ` (${c.severity})` : ' (severity not recorded)'}.{' '}
                              {c.reason}.
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1 text-[13px] text-[var(--ink-2)]">Check before issuing. This does not stop the prescription.</p>
                      </div>
                    )}

                    {savedMedicines !== null && (
                      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => saveRow(item)}
                          disabled={!item.medicine.trim() || savingKey === item.key}
                          className="text-[13px] font-medium text-[var(--ink-2)] underline-offset-4 hover:text-[var(--accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline"
                        >
                          {savingKey === item.key ? 'Saving…' : '☆ Save to my medicines'}
                        </button>
                        {rowNote[item.key] && (
                          <span role="status" className="text-[12px] text-[var(--ink-3)]">
                            {rowNote[item.key]}
                          </span>
                        )}
                      </div>
                    )}
                  </fieldset>
                </li>
              );
            })}
          </ol>

          <datalist id="rx-frequency-options">
            {FREQUENCY_SUGGESTIONS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          <datalist id="rx-duration-options">
            {DURATION_SUGGESTIONS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>

          <button
            type="button"
            onClick={() => addItem()}
            disabled={items.length >= RX_LIMITS.items}
            className="editorial-btn-ghost mt-4"
          >
            + Add another medicine
          </button>
        </Section>

        {/* ── Special instructions ──────────────────────────────────── */}
        <section
          aria-labelledby="rx-advice-title"
          className="rounded-2xl border border-[var(--hairline-strong)] border-l-[4px] bg-[var(--card)] px-5 py-5"
          // Inline: globals.css sets border-color on * outside any layer, so colour utilities lose.
          style={{ borderLeftColor: 'var(--accent)' }}
        >
          <h2 id="rx-advice-title" className="text-[17px] font-semibold text-[var(--ink)]">
            Special instructions &amp; advice
          </h2>
          <p className="mt-1 text-[13px] leading-[1.5] text-[var(--ink-3)]">
            Diet, fluids and the warning signs that mean {firstName} should be brought back. The family sees this in the app.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ADVICE_SNIPPETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => appendAdvice(s)}
                className="rounded-full border border-[var(--hairline-strong)] bg-[var(--paper)] px-3 py-1 text-[12px] text-[var(--ink-2)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                + {s.startsWith('Come back') ? 'Red-flag signs' : s.replace(/[.;].*$/, '')}
              </button>
            ))}
          </div>
          <label htmlFor="rx-advice" className="sr-only">
            Special instructions
          </label>
          <textarea
            id="rx-advice"
            value={header.advice}
            onChange={(e) => setH({ advice: e.target.value })}
            maxLength={RX_LIMITS.advice}
            rows={5}
            placeholder={'e.g. Plenty of fluids.\nCome back at once if breathing is fast, not drinking, or very drowsy.'}
            className="mt-3 w-full resize-y rounded-lg border border-[var(--hairline-strong)] bg-[var(--paper)] px-3 py-2.5 text-[15px] leading-[1.5] text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--ink)] focus:outline-none"
          />
        </section>

        {/* ── Follow-up ─────────────────────────────────────────────── */}
        <Section title="Follow-up" hint="Optional. Shown to the family with the prescription.">
          <div className="flex flex-wrap gap-2">
            {FOLLOW_UP_PRESETS.map((n) => {
              const date = plusDays(today, n);
              const active = header.followUpDate === date;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={active}
                  style={active ? { borderColor: 'var(--ink)' } : undefined}
                  onClick={() =>
                    setH({
                      followUpDate: date,
                      followUpText: n === 7 ? 'Review in 1 week' : n === 14 ? 'Review in 2 weeks' : `Review in ${n} days`,
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-[13px] ${
                    active
                      ? 'border-[var(--ink)] bg-[var(--lilac)] font-semibold text-[var(--ink)]'
                      : 'border-[var(--hairline-strong)] bg-[var(--paper)] text-[var(--ink-2)] hover:border-[var(--ink)]'
                  }`}
                >
                  In {n === 7 ? '1 week' : n === 14 ? '2 weeks' : `${n} days`}
                </button>
              );
            })}
            {(header.followUpDate || header.followUpText) && (
              <button
                type="button"
                onClick={() => setH({ followUpDate: '', followUpText: '' })}
                className="px-2 text-[13px] text-[var(--ink-3)] underline-offset-4 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-[12rem_1fr]">
            <Field
              id="rx-follow-date"
              label="Date"
              type="date"
              value={header.followUpDate}
              onChange={(v) => setH({ followUpDate: v })}
              min={today}
              max={plusDays(today, 366)}
            />
            <Field
              id="rx-follow-text"
              label="Note"
              value={header.followUpText}
              onChange={(v) => setH({ followUpText: v })}
              placeholder="e.g. Review in 3 days, earlier if fever persists"
              maxLength={RX_LIMITS.followUpText}
            />
          </div>
        </Section>

        {/* Phone / tablet: the preview sits here, before issuing. */}
        <details className="rounded-2xl border border-[var(--hairline-strong)] bg-[var(--paper-soft)] lg:hidden">
          <summary className="cursor-pointer list-none px-5 py-3 text-[14px] font-semibold text-[var(--ink)]">
            Preview the prescription ▾
          </summary>
          <div className="px-3 pb-3">{preview}</div>
        </details>

        {/* ── Footer: prescriber and issue ──────────────────────────── */}
        <section
          aria-label="Prescriber and issue"
          className="rounded-2xl border border-[var(--hairline-strong)] bg-[var(--card)] px-5 py-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
            <div className="min-w-0 text-[14px] leading-[1.55]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">Prescribed by</div>
              <div className="mt-1 text-[16px] font-semibold text-[var(--ink)]">{doctor.name}</div>
              {doctor.qualifications && <div className="text-[var(--ink-2)]">{doctor.qualifications}</div>}
              <div className={doctor.registrationNumber ? 'text-[var(--ink-2)]' : 'font-semibold text-[var(--alert)]'}>
                {doctor.registrationNumber ? `Reg. no. ${doctor.registrationNumber}` : 'Registration number missing'}
              </div>
            </div>
            <div className="text-[14px] leading-[1.55]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">Date</div>
              <div className="mt-1 font-mono text-[16px] text-[var(--ink)]">{formatDate(today)}</div>
            </div>
          </div>

          {existingCount > 0 && (
            <label className="mt-5 flex items-start gap-3 text-[14px] text-[var(--ink)]">
              <input
                type="checkbox"
                checked={confirmAnother}
                onChange={(e) => {
                  setError(null);
                  setConfirmAnother(e.target.checked);
                }}
                className="mt-1 h-4 w-4 accent-[var(--ink)]"
              />
              <span>Yes, issue another prescription for this visit ({existingCount} already issued).</span>
            </label>
          )}

          {shownError && (
            <p
              role="alert"
              style={{ borderLeftColor: 'var(--alert)' }}
              className="mt-5 rounded-lg border-l-[3px] bg-[var(--paper-soft)] px-3 py-2 text-[14px] text-[var(--alert)]"
            >
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

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--hairline)] pt-5">
            {registrationMissing && (
              <p className="mr-auto text-[13px] text-[var(--ink-3)]">
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
        </section>
      </div>

      {/* Desktop: live preview alongside the form. */}
      <aside aria-label="Prescription preview" className="hidden lg:block">
        <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pb-2">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">Live preview</span>
            <span className="text-[12px] text-[var(--ink-3)]">as the family and records will see it</span>
          </div>
          {preview}
        </div>
      </aside>
    </div>
  );
}

function stripId<T extends RxItemDraft>(it: T): RxItemDraft {
  return {
    medicine: it.medicine,
    brand: it.brand,
    strength: it.strength,
    dose: it.dose,
    frequency: it.frequency,
    duration: it.duration,
    route: it.route,
    timing: it.timing,
    notes: it.notes,
  };
}

function Section({
  title,
  hint,
  aside,
  children,
}: {
  title: ReactNode;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--hairline-strong)] bg-[var(--card)] px-5 py-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[17px] font-semibold text-[var(--ink)]">{title}</h2>
        {aside}
      </div>
      {hint && <p className="mt-1 text-[13px] leading-[1.5] text-[var(--ink-3)]">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Label({ htmlFor, label, required, optional, invalid }: { htmlFor: string; label: string; required?: boolean; optional?: boolean; invalid?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-[12px] font-semibold text-[var(--ink-2)]">
      {label}
      {required && (
        <span aria-hidden className="text-[var(--alert)]">
          *
        </span>
      )}
      {optional && <span className="font-normal text-[var(--ink-4)]">optional</span>}
      {invalid && <span className="font-semibold text-[var(--alert)]">· required</span>}
    </label>
  );
}

/** Inline, because globals.css sets border-color on * outside any layer (utilities lose). */
const invalidStyle = (invalid?: boolean): React.CSSProperties =>
  invalid ? { borderColor: 'var(--alert)', borderWidth: 2 } : { borderColor: 'var(--hairline-strong)' };

const boxInput =
  'mt-1 w-full rounded-lg border bg-[var(--paper)] px-3 py-2 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--ink)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-soft)]';

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  optional,
  invalid,
  maxLength,
  list,
  type = 'text',
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  invalid?: boolean;
  maxLength?: number;
  list?: string;
  type?: 'text' | 'date';
  min?: string;
  max?: string;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} label={label} required={required} optional={optional} invalid={invalid} />
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        list={list}
        min={min}
        max={max}
        required={required}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className={boxInput}
        style={invalidStyle(invalid)}
      />
    </div>
  );
}

function Area({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  optional,
  invalid,
  maxLength,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  invalid?: boolean;
  maxLength: number;
  rows?: number;
}) {
  return (
    <div>
      <Label htmlFor={id} label={label} required={required} optional={optional} invalid={invalid} />
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        required={required}
        aria-invalid={invalid || undefined}
        className={`${boxInput} resize-y leading-[1.5]`}
        style={invalidStyle(invalid)}
      />
    </div>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} label={label} optional />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={boxInput}
        style={invalidStyle(false)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-md border border-transparent text-[14px] text-[var(--ink-3)] hover:border-[var(--hairline-strong)] hover:bg-[var(--paper-soft)] disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? 'hover:text-[var(--alert)]' : 'hover:text-[var(--ink)]'
      }`}
    >
      {children}
    </button>
  );
}
