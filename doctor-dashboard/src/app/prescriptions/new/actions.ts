'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  notes?: string | null;
  items: PrescriptionItemInput[];
}): Promise<{ error?: string; prescriptionId?: string }> {
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

  redirect(`/`);
}
