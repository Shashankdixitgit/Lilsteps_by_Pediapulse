'use server';

import { redirect } from 'next/navigation';
import { syncConsultationPrescription } from '@/lib/consultations';
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

  if (params.appointmentId && !params.confirmAnother) {
    const { count } = await supabase
      .from('prescriptions')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', params.appointmentId);
    if (count && count > 0) {
      return { error: 'This visit already has a prescription. Confirm to issue another.' };
    }
  }

  const { data: prescription, error: prescErr } = await supabase
    .from('prescriptions')
    .insert({
      child_id: params.childId,
      doctor_id: doctorAuth.doctor_id,
      appointment_id: params.appointmentId ?? null,
      notes: params.notes ?? null,
    })
    .select('id')
    .single();

  if (prescErr || !prescription) {
    return { error: prescErr?.message ?? 'Failed to create prescription' };
  }

  const { error: itemsErr } = await supabase.from('prescription_items').insert(
    params.items.map((it, idx) => ({
      prescription_id: prescription.id,
      medicine: it.medicine.trim(),
      dose: it.dose.trim(),
      frequency: it.frequency.trim(),
      duration: it.duration?.trim() || null,
      notes: it.notes?.trim() || null,
      position: idx,
    })),
  );

  if (itemsErr) {
    return { error: `Items: ${itemsErr.message}` };
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
          channel: 'sms',
          template: 'prescription_issued',
          params: { doctor: doctor?.name ?? 'your doctor' },
          recipient: { parent_id: child.parent_id, child_id: params.childId },
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
