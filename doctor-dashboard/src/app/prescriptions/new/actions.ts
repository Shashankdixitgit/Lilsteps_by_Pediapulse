'use server';

import { redirect } from 'next/navigation';
import { syncConsultationPrescription } from '@/lib/consultations';
import { RX_LIMITS } from '@/lib/prescription-limits';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Shown by the form as a link to Settings; keep the wording in sync. */
const REGISTRATION_MISSING_ERROR =
  'Add your medical council registration number in Settings before issuing a prescription. It must be printed on every prescription.';

export interface PrescriptionItemInput {
  medicine: string;
  dose: string;
  frequency: string;
  duration?: string;
  notes?: string;
}

export async function createPrescriptionAction(params: {
  childId: string;
  appointmentId?: string | null;
  /** Required when the appointment already has a prescription. */
  confirmAnother?: boolean;
  notes?: string | null;
  items: PrescriptionItemInput[];
}): Promise<{ error?: string; prescriptionId?: string; needsRegistration?: boolean }> {
  if (!params.childId) return { error: 'Missing child' };
  if (params.items.length === 0) return { error: 'Add at least one medicine' };

  for (const item of params.items) {
    if (!item.medicine.trim() || !item.dose.trim() || !item.frequency.trim()) {
      return { error: 'Each medicine needs name, dose, and frequency' };
    }
    if (
      item.medicine.trim().length > RX_LIMITS.medicine ||
      item.dose.trim().length > RX_LIMITS.dose ||
      item.frequency.trim().length > RX_LIMITS.frequency ||
      (item.duration?.trim().length ?? 0) > RX_LIMITS.duration ||
      (item.notes?.trim().length ?? 0) > RX_LIMITS.itemNotes
    ) {
      return {
        error: `Keep each medicine short: name up to ${RX_LIMITS.medicine} characters, dose, frequency and duration up to ${RX_LIMITS.dose}, special instructions up to ${RX_LIMITS.itemNotes}.`,
      };
    }
  }
  if ((params.notes?.trim().length ?? 0) > RX_LIMITS.notes) {
    return { error: `Notes can be up to ${RX_LIMITS.notes} characters.` };
  }

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

  // Header and items in one transaction (create_prescription, migration
  // 0050). It re-checks the doctor, the visit, the registration number and
  // the field limits, and freezes the doctor's name / registration number /
  // qualifications on the prescription.
  const { data: prescriptionId, error: rxErr } = await supabase.rpc('create_prescription', {
    header: {
      child_id: params.childId,
      appointment_id: params.appointmentId ?? null,
      notes: params.notes?.trim() || null,
    },
    items: params.items.map((it) => ({
      medicine: it.medicine.trim(),
      dose: it.dose.trim(),
      frequency: it.frequency.trim(),
      duration: it.duration?.trim() || null,
      notes: it.notes?.trim() || null,
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
