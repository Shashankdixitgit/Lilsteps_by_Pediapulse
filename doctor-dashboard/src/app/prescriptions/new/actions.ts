'use server';

import { redirect } from 'next/navigation';
import { syncConsultationPrescription } from '@/lib/consultations';
import { todayIst } from '@/lib/format';
import {
  RX_LIMITS,
  validatePrescription,
  type RxHeaderDraft,
  type RxItemDraft,
} from '@/lib/prescription-limits';
import {
  SAVED_MEDICINE_COLUMNS,
  toSavedMedicine,
  type SavedMedicine,
  type SavedMedicineRow,
} from '@/lib/saved-medicines';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Shown by the form as a link to Settings; keep the wording in sync. */
const REGISTRATION_MISSING_ERROR =
  'Add your medical council registration number in Settings before issuing a prescription. It must be printed on every prescription.';

export type PrescriptionItemInput = RxItemDraft;

/** Trimmed text, or null when blank. */
const clean = (v: string | null | undefined) => v?.trim() || null;

export async function createPrescriptionAction(params: {
  childId: string;
  appointmentId?: string | null;
  /** Required when the appointment already has a prescription. */
  confirmAnother?: boolean;
  header: RxHeaderDraft;
  items: PrescriptionItemInput[];
}): Promise<{ error?: string; prescriptionId?: string; needsRegistration?: boolean }> {
  if (!params.childId) return { error: 'Missing child' };

  // Same check as the form (lib/prescription-limits): diagnosis, at least
  // one medicine, required fields per medicine, length limits, follow-up date.
  const invalid = validatePrescription(params.header, params.items, todayIst());
  if (invalid) return { error: invalid };

  const supabase = await createSupabaseServerClient();

  // Look up the doctor id for the authenticated user.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: doctorAuth } = await supabase
    .from('doctor_auth')
    .select('doctor_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!doctorAuth) return { error: 'Not a doctor account' };

  // Telemedicine Practice Guidelines (2020): a prescription must carry the
  // doctor's medical council registration number. Refuse until it is added.
  const { data: registration } = await supabase
    .from('doctors')
    .select('registration_number')
    .eq('id', doctorAuth.doctor_id)
    .maybeSingle<{ registration_number: string | null }>();
  if (!registration?.registration_number?.trim()) {
    return { error: REGISTRATION_MISSING_ERROR, needsRegistration: true };
  }

  // Friendlier refusal before the RPC (which checks the same, 0050): only
  // this doctor's own upcoming or completed visit for this child.
  if (params.appointmentId) {
    const { data: visit } = await supabase
      .from('appointments')
      .select('id, status')
      .eq('id', params.appointmentId)
      .eq('doctor_id', doctorAuth.doctor_id)
      .eq('child_id', params.childId)
      .maybeSingle<{ id: string; status: string }>();
    if (!visit || (visit.status !== 'upcoming' && visit.status !== 'completed')) {
      return { error: 'This visit is not one of yours for this child, so the prescription cannot be attached to it.' };
    }
  }

  if (params.appointmentId && !params.confirmAnother) {
    const { count } = await supabase
      .from('prescriptions')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', params.appointmentId);
    if (count && count > 0) {
      return { error: 'This visit already has a prescription. Confirm to issue another.' };
    }
  }

  // Header and items in one transaction (create_prescription, migrations
  // 0050 and 0055). It re-checks the doctor, the visit, the registration number and
  // the field limits, and freezes the doctor's name / registration number /
  // qualifications on the prescription.
  const { data: prescriptionId, error: rxErr } = await supabase.rpc('create_prescription', {
    header: {
      child_id: params.childId,
      appointment_id: params.appointmentId ?? null,
      chief_complaints: clean(params.header.chiefComplaints),
      examination: clean(params.header.examination),
      diagnosis: clean(params.header.diagnosis),
      advice: clean(params.header.advice),
      follow_up_date: clean(params.header.followUpDate),
      follow_up_text: clean(params.header.followUpText),
    },
    // Generic names in capitals (IMC Regulations 2002 §1.5: "generic names,
    // legibly and preferably in capital letters"); the brand stays as typed.
    items: params.items.map((it) => ({
      medicine: it.medicine.trim().toUpperCase(),
      brand: clean(it.brand),
      strength: clean(it.strength),
      dose: it.dose.trim(),
      frequency: it.frequency.trim(),
      duration: clean(it.duration),
      route: clean(it.route),
      timing: clean(it.timing),
      notes: clean(it.notes),
    })),
  });

  if (rxErr || !prescriptionId) {
    if (rxErr?.message === REGISTRATION_MISSING_ERROR) {
      return { error: REGISTRATION_MISSING_ERROR, needsRegistration: true };
    }
    return { error: rxErr?.message ?? 'Failed to create prescription' };
  }

  // Notify the parent that a prescription was issued.
  const { data: child } = await supabase
    .from('children')
    .select('parent_id')
    .eq('id', params.childId)
    .maybeSingle<{ parent_id: string }>();

  const { data: doctor } = await supabase
    .from('doctors')
    .select('name')
    .eq('id', doctorAuth.doctor_id)
    .maybeSingle<{ name: string }>();

  if (child) {
    supabase.functions
      .invoke('notify', {
        body: {
          channel: 'email',
          template: 'prescription_issued',
          params: { doctor: doctor?.name ?? 'your doctor' },
          recipient: {
            parent_id: child.parent_id,
            child_id: params.childId,
            ...(params.appointmentId ? { appointment_id: params.appointmentId } : {}),
          },
        },
      })
      .catch(() => {
        /* notify failures are logged in notification_log */
      });
  }

  // If the visit was already closed, keep the parent's visit summary current.
  if (params.appointmentId) await syncConsultationPrescription(supabase, params.appointmentId);

  // Back to where the doctor came from, with a confirmation toast.
  redirect(
    params.appointmentId
      ? `/consultations/${params.appointmentId}?issued=1`
      : `/prescriptions?child=${params.childId}&issued=1`,
  );
}

// ── My saved medicines (doctor_saved_medicines, migration 0055) ────────────

/** Saves one medicine row to the signed-in doctor's list. RLS keeps it theirs. */
export async function saveMedicineAction(item: RxItemDraft): Promise<{ error?: string; saved?: SavedMedicine }> {
  const medicine = item.medicine.trim().toUpperCase();
  if (!medicine) return { error: 'Add the generic name before saving' };
  if (
    medicine.length > RX_LIMITS.medicine ||
    (item.brand?.trim().length ?? 0) > RX_LIMITS.brand ||
    (item.strength?.trim().length ?? 0) > RX_LIMITS.strength ||
    (item.dose?.trim().length ?? 0) > RX_LIMITS.dose ||
    (item.frequency?.trim().length ?? 0) > RX_LIMITS.frequency ||
    (item.duration?.trim().length ?? 0) > RX_LIMITS.duration ||
    (item.route?.trim().length ?? 0) > RX_LIMITS.route ||
    (item.timing?.trim().length ?? 0) > RX_LIMITS.timing ||
    (item.notes?.trim().length ?? 0) > RX_LIMITS.itemNotes
  ) {
    return { error: 'This medicine has a field that is too long to save' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const { data: doctorAuth } = await supabase
    .from('doctor_auth')
    .select('doctor_id')
    .eq('id', user.id)
    .maybeSingle<{ doctor_id: string }>();
  if (!doctorAuth) return { error: 'Not a doctor account' };

  const { data, error } = await supabase
    .from('doctor_saved_medicines')
    .insert({
      doctor_id: doctorAuth.doctor_id,
      medicine,
      brand: clean(item.brand),
      strength: clean(item.strength),
      dose: clean(item.dose),
      frequency: clean(item.frequency),
      duration: clean(item.duration),
      route: clean(item.route),
      timing: clean(item.timing),
      notes: clean(item.notes),
    })
    .select(SAVED_MEDICINE_COLUMNS)
    .single<SavedMedicineRow>();
  if (error) {
    if (error.code === '23505') return { error: 'Already in your saved medicines' };
    return { error: 'Could not save this medicine. Please try again.' };
  }
  return { saved: toSavedMedicine(data) };
}

/** Removes one of the signed-in doctor's saved medicines. */
export async function deleteSavedMedicineAction(id: string): Promise<{ error?: string }> {
  if (!id) return { error: 'Missing medicine' };
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('doctor_saved_medicines')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return { error: 'Could not remove this medicine. Please try again.' };
  if (!count) return { error: 'That saved medicine was already removed' };
  return {};
}
