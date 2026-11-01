import type { SupabaseClient } from '@supabase/supabase-js';
import { istDatePlus, istNowPlus } from './format';

/** An open slot of the signed-in doctor. */
export type OpenSlot = { id: string; date: string; time: string };

/** How far ahead the Reschedule / Book follow-up pickers look (slots exist 14 days ahead). */
export const PICKER_DAYS = 14;

/**
 * The doctor's open slots from `minutesAhead` minutes from now (IST) up to
 * PICKER_DAYS days ahead, in time order. Reschedule and follow-up both pass
 * 120: reschedule_appointment and book_followup (0051) need the new time 2
 * hours or more away. The database checks again on save.
 */
export async function fetchOpenSlots(
  supabase: SupabaseClient,
  doctorId: string,
  minutesAhead: number,
): Promise<OpenSlot[]> {
  const from = istNowPlus(minutesAhead);
  const { data } = await supabase
    .from('time_slots')
    .select('id, date, time')
    .eq('doctor_id', doctorId)
    .eq('is_available', true)
    .gte('date', from.date)
    .lte('date', istDatePlus(PICKER_DAYS))
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(500)
    .returns<OpenSlot[]>();
  return (data ?? []).filter((s) => s.date > from.date || s.time > from.time);
}
