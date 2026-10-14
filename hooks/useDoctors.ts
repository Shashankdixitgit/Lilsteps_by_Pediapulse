import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface DoctorRow {
  id: string;
  name: string;
  specialisation: string;
  hospital: string;
  avatar_url: string | null;
  is_available: boolean;
  /** The doctor has saved a Meet room (0035). The link itself is never read here. */
  has_meet_link: boolean;
  /** Per-booking Meet links through Google Calendar (Option B, 0034). */
  has_google_calendar: boolean;
}

/** Columns a parent may read. Never `*`: default_meet_link is private (0035). */
export const DOCTOR_PUBLIC_COLUMNS =
  'id, name, specialisation, hospital, avatar_url, is_available, has_meet_link, has_google_calendar';

/** True when a consult with this doctor will have a video link. */
export function doctorHasVideoLink(d: Pick<DoctorRow, 'has_meet_link' | 'has_google_calendar'> | null | undefined): boolean {
  return !!d && (d.has_meet_link || d.has_google_calendar);
}

/**
 * Link status for one doctor (booking screens). null while loading or when
 * unknown, so callers show nothing rather than a wrong hint.
 */
export function useDoctorVideoLink(doctorId: string | null | undefined): boolean | null {
  const [state, setState] = useState<{ id: string; has: boolean } | null>(null);

  useEffect(() => {
    if (!doctorId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('doctors')
        .select('has_meet_link, has_google_calendar')
        .eq('id', doctorId)
        .maybeSingle<Pick<DoctorRow, 'has_meet_link' | 'has_google_calendar'>>();
      if (!cancelled && data) setState({ id: doctorId, has: doctorHasVideoLink(data) });
    })();
    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  return doctorId && state?.id === doctorId ? state.has : null;
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
      // Only doctors who have signed up for the clinical dashboard surface in
      // the parent app (has_dashboard_login is kept in step with doctor_auth,
      // 0034). Leftover seed rows without a login are filtered out. Parents
      // can't read doctor_auth itself (0035).
      const { data, error: err } = await supabase
        .from('doctors')
        .select(DOCTOR_PUBLIC_COLUMNS)
        .eq('is_available', true)
        .eq('has_dashboard_login', true)
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
