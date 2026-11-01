import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * A free, still-ahead slot with its doctor, from the 0030 lookups. Only
 * doctors who take bookings and have a dashboard login are included (same
 * rule as useDoctors).
 */
export interface FreeSlot {
  slot_id: string;
  doctor_id: string;
  doctor_name: string;
  specialisation: string;
  /** Clinic (IST) date, YYYY-MM-DD */
  date: string;
  /** Clinic (IST) wall-clock time, HH:MM:SS */
  time: string;
}

/** Route value for "any doctor" in the consult booking flow. */
export const ANY_DOCTOR = 'any';

function bySoonest(a: FreeSlot, b: FreeSlot) {
  return a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date);
}

/**
 * Each doctor's earliest free slot (next_free_slot_per_doctor), soonest
 * first. `earliest` is the soonest across all doctors. Urgent check-ins can
 * use `sameDay(today)` to find who still has a slot today.
 */
export function useNextFreeSlots() {
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('next_free_slot_per_doctor');
    if (err) setError(err.message);
    else setSlots(((data ?? []) as FreeSlot[]).slice().sort(bySoonest));
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const byDoctor = new Map(slots.map((s) => [s.doctor_id, s]));
  return {
    slots,
    earliest: slots[0] ?? null,
    byDoctor,
    sameDay: (isoDate: string) => slots.filter((s) => s.date === isoDate),
    loading,
    error,
    refetch,
  };
}

/**
 * Free slots on one clinic date (free_slots_on), earliest first. With no
 * doctor, every bookable doctor is included; at the same time the less busy
 * doctor that day comes first.
 */
export async function fetchFreeSlotsOn(isoDate: string, doctorId?: string | null): Promise<FreeSlot[]> {
  const { data, error } = await supabase.rpc('free_slots_on', {
    p_date: isoDate,
    p_doctor_id: doctorId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as FreeSlot[];
}

/**
 * Index of the first booking day with a free, still-ahead slot (for one
 * doctor, or any bookable doctor); 0 when none is free or the lookup fails.
 */
export async function firstFreeDayIndex(doctorId: string | null, isoDates: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('next_free_slot_per_doctor');
  if (error || !data) return 0;
  const dates = (data as FreeSlot[])
    .filter((s) => !doctorId || s.doctor_id === doctorId)
    .map((s) => s.date)
    .sort();
  const idx = dates.length > 0 ? isoDates.indexOf(dates[0]) : -1;
  return idx === -1 ? 0 : idx;
}
