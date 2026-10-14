import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { addCalendar, parseDateOnly, toDateOnlyString } from '@/lib/date';
import { istTodayDateOnly } from '@/hooks/useGrowth';
import { ANNUAL_VACCINE_NAMES } from '@/constants/vaccineQuestions';

export type VaccinationStatus = 'done' | 'due_soon' | 'overdue' | 'upcoming' | 'unknown';

export interface VaccinationRow {
  id: string;
  child_id: string;
  vaccine_master_id: string | null;
  vaccine_name: string;
  dose_label: string;
  dose_number: number;
  scheduled_date: string;
  administered_date: string | null;
  /**
   * As shown to the parent. 'done' and 'unknown' (answered "Not sure") are
   * read as stored; the rest is worked out from scheduled_date against today
   * (IST), because the stored value is a snapshot from when the schedule was
   * created and nothing moves it on as the dates pass.
   */
  status: VaccinationStatus;
  created_at: string;
}

/**
 * Same rule as public.vaccine_status_for(): past = overdue, next 14 days = due.
 * Pass the vaccine name: the yearly flu shot (ANNUAL_VACCINE_NAMES) is never
 * overdue; once its first date has passed it is a yearly dose to ask about
 * ('upcoming'), so it is never written or shown as overdue (R2-20, R2-10).
 */
export function statusForDate(
  scheduledDate: string,
  today: string = istTodayDateOnly(),
  vaccineName?: string,
): VaccinationStatus {
  if (scheduledDate < today) {
    return vaccineName && ANNUAL_VACCINE_NAMES.has(vaccineName) ? 'upcoming' : 'overdue';
  }
  const dueSoonUntil = toDateOnlyString(addCalendar(parseDateOnly(today), { days: 14 }));
  return scheduledDate <= dueSoonUntil ? 'due_soon' : 'upcoming';
}

function withLiveStatus(row: VaccinationRow, today: string): VaccinationRow {
  if (row.status === 'done') return row;
  // The flu shot is yearly: never "Not sure" catch-up, never overdue.
  if (row.status === 'unknown' && !ANNUAL_VACCINE_NAMES.has(row.vaccine_name)) return row;
  return { ...row, status: statusForDate(row.scheduled_date, today, row.vaccine_name) };
}

export function useVaccinations(childId: string | null) {
  const [vaccinations, setVaccinations] = useState<VaccinationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  const fetch = useCallback(async () => {
    if (!childId) {
      setVaccinations([]);
      setLoading(false);
      return;
    }
    // Switching child: drop the old child's rows so they can't be shown or
    // marked under the new child's name while the fetch is in flight.
    if (loadedFor.current !== childId) {
      setVaccinations([]);
      loadedFor.current = childId;
    }
    setLoading(true);
    setError(null);

    // An auth (expired session) or network failure must reach the screen as
    // an error, never as an empty "nothing due" list (R3-11, R3-12).
    try {
      const { data, error: err } = await supabase
        .from('vaccinations')
        .select('*')
        .eq('child_id', childId)
        .order('scheduled_date', { ascending: true })
        .order('vaccine_name', { ascending: true });
      // A newer child was selected while this was in flight: drop the result.
      if (loadedFor.current !== childId) return;
      if (err) {
        setError(err.message || 'Could not load vaccines');
      } else {
        const today = istTodayDateOnly();
        setVaccinations(((data ?? []) as VaccinationRow[]).map((r) => withLiveStatus(r, today)));
      }
    } catch (e) {
      if (loadedFor.current !== childId) return;
      setError(e instanceof Error ? e.message : 'Could not load vaccines');
    }
    setLoading(false);
  }, [childId]);

  useEffect(() => { fetch(); }, [fetch]);

  /**
   * Record a dose as given. `administeredDate`: 'YYYY-MM-DD', or null when the
   * parent doesn't know the date. Defaults to today (IST).
   */
  async function markDone(vaccinationId: string, administeredDate?: string | null) {
    const { error: err } = await supabase
      .from('vaccinations')
      .update({
        status: 'done',
        administered_date: administeredDate === undefined ? istTodayDateOnly() : administeredDate,
      })
      .eq('id', vaccinationId);

    if (err) throw new Error(err.message);
    await fetch();
  }

  /** Undo "given": the dose goes back to overdue / due / upcoming by its date. */
  async function markNotGiven(vaccinationId: string) {
    const row = vaccinations.find((v) => v.id === vaccinationId);
    if (!row) throw new Error('This dose is no longer in the list. Please refresh.');
    const { error: err } = await supabase
      .from('vaccinations')
      .update({ status: statusForDate(row.scheduled_date, undefined, row.vaccine_name), administered_date: null })
      .eq('id', vaccinationId);

    if (err) throw new Error(err.message);
    await fetch();
  }

  /** Back to "Not sure" (to check with the doctor), e.g. undoing "It was not given". */
  async function markNotSure(vaccinationId: string) {
    const row = vaccinations.find((v) => v.id === vaccinationId);
    if (!row) throw new Error('This dose is no longer in the list. Please refresh.');
    if (ANNUAL_VACCINE_NAMES.has(row.vaccine_name)) throw new Error('The yearly flu shot has no "Not sure" option.');
    const { error: err } = await supabase
      .from('vaccinations')
      .update({ status: 'unknown', administered_date: null })
      .eq('id', vaccinationId);

    if (err) throw new Error(err.message);
    await fetch();
  }

  return { vaccinations, loading, error, markDone, markNotGiven, markNotSure, refetch: fetch };
}
