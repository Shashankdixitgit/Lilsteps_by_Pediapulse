import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PrescriptionItemRow {
  id: string;
  prescription_id: string;
  medicine: string;
  dose: string;
  frequency: string;
  duration: string | null;
  notes: string | null;
  position: number;
  /** Migration 0055; null on older prescriptions. */
  brand?: string | null;
  strength?: string | null;
  route?: string | null;
  timing?: string | null;
}

export interface PrescriptionRow {
  id: string;
  consultation_id: string | null;
  appointment_id: string | null;
  child_id: string;
  doctor_id: string;
  issued_at: string;
  notes: string | null;
  pdf_url: string | null;
  created_at: string;
  /** Issuing doctor as they were when it was issued (migration 0050). Prefer these over doctors(). */
  doctor_name?: string | null;
  registration_number?: string | null;
  qualifications?: string | null;
  /** Clinical note, advice and follow-up (migration 0055); null on older prescriptions. */
  chief_complaints?: string | null;
  examination?: string | null;
  diagnosis?: string | null;
  advice?: string | null;
  follow_up_date?: string | null;
  follow_up_text?: string | null;
  // joined
  doctors?: { name: string; specialisation: string };
  prescription_items?: PrescriptionItemRow[];
}

export function usePrescriptions(childId: string | null) {
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!childId) {
      setPrescriptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('prescriptions')
      .select('*, doctors(name, specialisation), prescription_items(*)')
      .eq('child_id', childId)
      .order('issued_at', { ascending: false });

    if (err) setError(err.message);
    else {
      const rows = (data ?? []) as PrescriptionRow[];
      // Order items by position on the client (cheaper than nested order in PostgREST).
      rows.forEach((p) => {
        if (p.prescription_items) {
          p.prescription_items.sort((a, b) => a.position - b.position);
        }
      });
      setPrescriptions(rows);
    }
    setLoading(false);
  }, [childId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { prescriptions, loading, error, refetch: fetch };
}
