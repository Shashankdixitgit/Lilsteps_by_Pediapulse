import type { SupabaseClient } from '@supabase/supabase-js';

/** The doctor's structured visit notes, kept in consultations.doctor_notes as JSON. */
export type VisitNotes = { diagnosis: string; advice: string; followUp: string };

export const EMPTY_NOTES: VisitNotes = { diagnosis: '', advice: '', followUp: '' };

export function parseVisitNotes(raw: string | null | undefined): VisitNotes {
  if (!raw) return EMPTY_NOTES;
  try {
    const v = JSON.parse(raw) as Partial<VisitNotes>;
    return {
      diagnosis: typeof v.diagnosis === 'string' ? v.diagnosis : '',
      advice: typeof v.advice === 'string' ? v.advice : '',
      followUp: typeof v.followUp === 'string' ? v.followUp : '',
    };
  } catch {
    // Older free-text note: treat it as advice so nothing is lost.
    return { ...EMPTY_NOTES, advice: raw };
  }
}

/**
 * consultations.outcome is what the parent app shows under "Doctor's notes"
 * (app/consult/[id].tsx), so it is written as plain, parent-readable text.
 */
export function composeOutcome(notes: VisitNotes, noShow: boolean): string | null {
  const parts: string[] = [];
  if (noShow) {
    parts.push('Missed visit — the doctor marked this consultation as a no-show. Book again if your child still needs care.');
  }
  if (notes.diagnosis.trim()) parts.push(`Diagnosis: ${notes.diagnosis.trim()}`);
  if (notes.advice.trim()) parts.push(`Advice: ${notes.advice.trim()}`);
  if (notes.followUp.trim()) parts.push(`Follow-up: ${notes.followUp.trim()}`);
  return parts.length ? parts.join('\n\n') : null;
}

/**
 * Allergy severity as the doctor reads it. The parent app stores 'unknown'
 * when the parent didn't say; "(unknown)" read like an unknown allergen.
 */
export function severityLabel(severity: string | null | undefined): string {
  const s = severity?.trim();
  return !s || s.toLowerCase() === 'unknown' ? 'severity not recorded' : s;
}

/** "Penicillin (severe)", "Peanut (severity not recorded)". */
export function allergyText(a: { name: string; severity: string | null | undefined }): string {
  return `${a.name} (${severityLabel(a.severity)})`;
}

type RxItem = {
  medicine: string;
  dose: string;
  frequency: string;
  duration: string | null;
  notes: string | null;
  position: number;
};

/** Plain-text list of every prescription issued for this appointment, or null. */
export async function prescriptionText(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('prescriptions')
    .select('notes, issued_at, prescription_items(medicine, dose, frequency, duration, notes, position)')
    .eq('appointment_id', appointmentId)
    .order('issued_at', { ascending: true })
    .returns<{ notes: string | null; issued_at: string; prescription_items: RxItem[] }[]>();
  if (!data || data.length === 0) return null;

  const lines: string[] = [];
  data.forEach((p) => {
    [...p.prescription_items]
      .sort((a, b) => a.position - b.position)
      .forEach((it) => {
        // Item notes ("after food", "only if fever over 100°F") are part of the dose.
        lines.push(
          [it.medicine, it.dose, it.frequency, it.duration, it.notes].filter((x) => x && x.trim()).join(' · '),
        );
      });
    if (p.notes?.trim()) lines.push(`Note: ${p.notes.trim()}`);
  });
  return lines.length ? lines.join('\n') : null;
}

/** Keeps consultations.prescription in step after a prescription is issued for a closed visit. */
export async function syncConsultationPrescription(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  const text = await prescriptionText(supabase, appointmentId);
  await supabase.from('consultations').update({ prescription: text }).eq('appointment_id', appointmentId);
}
