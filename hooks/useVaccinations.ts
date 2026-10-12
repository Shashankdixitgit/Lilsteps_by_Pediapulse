import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface VaccinationRow {
  id: string;
  child_id: string;
  vaccine_master_id: string | null;
  vaccine_name: string;
  dose_label: string;
  dose_number: number;
  scheduled_date: string;
  administered_date: string | null;
  status: 'done' | 'due_soon' | 'overdue' | 'upcoming';
  created_at: string;
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

    const { data, error: err } = await supabase
      .from('vaccinations')
      .select('*')
      .eq('child_id', childId)
      .order('scheduled_date', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setVaccinations(data ?? []);
    }
    setLoading(false);
  }, [childId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function markDone(vaccinationId: string, administeredDate?: string) {
    const { error: err } = await supabase
      .from('vaccinations')
      .update({
        status: 'done',
        administered_date: administeredDate ?? new Date().toISOString().split('T')[0],
      })
      .eq('id', vaccinationId);

    if (err) throw new Error(err.message);
    await fetch();
  }

  return { vaccinations, loading, error, markDone, refetch: fetch };
}
