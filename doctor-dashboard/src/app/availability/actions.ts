'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function currentDoctorId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('doctor_auth')
    .select('doctor_id')
    .eq('id', user.id)
    .maybeSingle<{ doctor_id: string }>();
  return data?.doctor_id ?? null;
}

export interface GenerateSlotsInput {
  startDate: string;   // YYYY-MM-DD
  days: number;        // 1..30
  startHour: number;   // 0..23
  endHour: number;     // > startHour
  intervalMinutes: 15 | 30 | 45 | 60;
  skipSundays: boolean;
}

export async function generateSlotsAction(
  input: GenerateSlotsInput,
): Promise<{ error?: string; inserted?: number }> {
  if (input.days < 1 || input.days > 30) return { error: 'Days must be 1–30' };
  if (input.endHour <= input.startHour) return { error: 'End hour must be after start hour' };

  const doctorId = await currentDoctorId();
  if (!doctorId) return { error: 'Not signed in as a doctor' };

  const supabase = await createSupabaseServerClient();
  const rows: { doctor_id: string; date: string; time: string; is_available: boolean }[] = [];

  // Parse YYYY-MM-DD as pure components — DON'T pass through new Date(string)
  // then toISOString(), which would shift IST dates back a day in UTC and
  // silently insert slots for yesterday.
  const [startY, startM, startD] = input.startDate.split('-').map(Number);
  if (!startY || !startM || !startD) return { error: 'Invalid start date' };

  for (let dayOffset = 0; dayOffset < input.days; dayOffset++) {
    const day = new Date(startY, startM - 1, startD + dayOffset);
    if (input.skipSundays && day.getDay() === 0) continue;

    const y = day.getFullYear();
    const mm = String(day.getMonth() + 1).padStart(2, '0');
    const dd = String(day.getDate()).padStart(2, '0');
    const isoDate = `${y}-${mm}-${dd}`;

    for (let h = input.startHour; h < input.endHour; h++) {
      for (let mins = 0; mins < 60; mins += input.intervalMinutes) {
        const time = `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
        rows.push({ doctor_id: doctorId, date: isoDate, time, is_available: true });
      }
    }
  }

  if (rows.length === 0) return { error: 'No slots to generate' };

  const { error, count } = await supabase
    .from('time_slots')
    .upsert(rows, { onConflict: 'doctor_id,date,time', count: 'exact', ignoreDuplicates: true });

  if (error) return { error: error.message };

  revalidatePath('/availability');
  return { inserted: count ?? rows.length };
}

/** True when a live (not cancelled) appointment holds this doctor's slot. */
async function slotIsBooked(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  doctorId: string,
  date: string,
  time: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('doctor_id', doctorId)
    .eq('date', date)
    .eq('time', time)
    .neq('status', 'cancelled');
  return (count ?? 0) > 0;
}

/** Loads one of the current doctor's slots, refusing booked ones. */
async function ownUnbookedSlot(slotId: string) {
  const doctorId = await currentDoctorId();
  if (!doctorId) return { error: 'Not signed in as a doctor' } as const;
  const supabase = await createSupabaseServerClient();
  const { data: slot } = await supabase
    .from('time_slots')
    .select('id, date, time')
    .eq('id', slotId)
    .eq('doctor_id', doctorId)
    .maybeSingle<{ id: string; date: string; time: string }>();
  if (!slot) return { error: 'Slot not found' } as const;
  if (await slotIsBooked(supabase, doctorId, slot.date, slot.time)) {
    return { error: 'This slot is booked. Cancel or close the appointment first.' } as const;
  }
  return { supabase, doctorId, slot } as const;
}

export async function toggleSlotAction(
  slotId: string,
  available: boolean,
): Promise<{ error?: string }> {
  const res = await ownUnbookedSlot(slotId);
  if ('error' in res) return { error: res.error };
  const { error } = await res.supabase
    .from('time_slots')
    .update({ is_available: available })
    .eq('id', slotId)
    .eq('doctor_id', res.doctorId);
  if (error) return { error: error.message };
  revalidatePath('/availability');
  return {};
}

export async function deleteSlotAction(slotId: string): Promise<{ error?: string }> {
  const res = await ownUnbookedSlot(slotId);
  if ('error' in res) return { error: res.error };
  const { error } = await res.supabase
    .from('time_slots')
    .delete()
    .eq('id', slotId)
    .eq('doctor_id', res.doctorId);
  if (error) return { error: error.message };
  revalidatePath('/availability');
  return {};
}

/** Deletes every slot on the date except the ones a live appointment holds. */
export async function deleteSlotsForDateAction(
  date: string,
): Promise<{ error?: string; deleted?: number; kept?: number }> {
  const doctorId = await currentDoctorId();
  if (!doctorId) return { error: 'Not signed in as a doctor' };
  const supabase = await createSupabaseServerClient();

  const { data: booked, error: bookedErr } = await supabase
    .from('appointments')
    .select('time')
    .eq('doctor_id', doctorId)
    .eq('date', date)
    .neq('status', 'cancelled')
    .returns<{ time: string }[]>();
  if (bookedErr) return { error: bookedErr.message };
  const bookedTimes = (booked ?? []).map((b) => b.time);

  let q = supabase
    .from('time_slots')
    .delete({ count: 'exact' })
    .eq('doctor_id', doctorId)
    .eq('date', date);
  if (bookedTimes.length > 0) q = q.not('time', 'in', `(${bookedTimes.join(',')})`);
  const { error, count } = await q;
  if (error) return { error: error.message };
  revalidatePath('/availability');
  return { deleted: count ?? 0, kept: bookedTimes.length };
}
