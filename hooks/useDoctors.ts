import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface DoctorRow {
  id: string;
  name: string;
  specialisation: string;
  hospital: string;
  avatar_url: string | null;
  is_available: boolean;
}

export interface TimeSlotRow {
  id: string;
  doctor_id: string;
  date: string;
  time: string;
  is_available: boolean;
}

export function useDoctors() {
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Inner-join through doctor_auth so only doctors who have signed up
      // for the clinical dashboard surface in the parent app. Leftover seed
      // rows without a doctor_auth link are filtered out.
      const { data, error: err } = await supabase
        .from('doctors')
        .select('*, doctor_auth!inner(id)')
        .eq('is_available', true)
        .order('name');

      if (err) {
        setError(err.message);
      } else {
        setDoctors((data ?? []) as DoctorRow[]);
      }
      setLoading(false);
    })();
  }, []);

  return { doctors, loading, error };
}

// Clinic local time. IST has no DST so this is stable year-round.
const CLINIC_TZ = 'Asia/Kolkata';

function nowInClinic(): { date: string; time: string } {
  const now = new Date();
  // en-CA gives YYYY-MM-DD; en-GB gives HH:MM:SS in 24h. Both sortable as strings.
  return {
    date: now.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ }),
    time: now.toLocaleTimeString('en-GB', { timeZone: CLINIC_TZ, hour12: false }),
  };
}

export function useTimeSlots(doctorId: string | null, date: string | null) {
  const [slots, setSlots] = useState<TimeSlotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!doctorId || !date) {
      setSlots([]);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('time_slots')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .order('time');

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    // Hide already-elapsed slots when the picked date is today (clinic time).
    // Past-date slots stay visible only for read-only contexts; the picker
    // never lets you select a past date so this branch effectively only
    // trims the today list.
    const all = data ?? [];
    const { date: today, time: nowTime } = nowInClinic();
    const filtered = date === today ? all.filter((s) => s.time > nowTime) : all;
    setSlots(filtered);
    setLoading(false);
  }, [doctorId, date]);

  useEffect(() => { fetch(); }, [fetch]);

  return { slots, loading, error, refetch: fetch };
}
