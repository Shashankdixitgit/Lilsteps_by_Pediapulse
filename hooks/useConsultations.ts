import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ConsultationRow {
  id: string;
  appointment_id: string | null;
  child_id: string;
  doctor_name: string;
  doctor_specialisation: string | null;
  chief_complaint: string | null;
  outcome: string | null;
  prescription: string | null;
  ai_summary: {
    chiefComplaint: string;
    /** Plain-words headline for the parent (chiefComplaint is written for the doctor). */
    parentSummary?: string | null;
    details: { label: string; value: string }[];
    relevantHistory: string | null;
    allergyNote: string | null;
  } | null;
  doctor_notes: string | null;
  created_at: string;
}

/**
 * Title a parent sees for a consultation. chief_complaint is copied from the
 * check-in's clinical wording ("…central cyanosis"), so the plain-words
 * parentSummary wins when the check-in has one (R2-08).
 */
export function parentConsultTitle(c: Pick<ConsultationRow, 'chief_complaint' | 'ai_summary'>): string | null {
  const plain = c.ai_summary?.parentSummary;
  if (typeof plain === 'string' && plain.trim()) return plain.trim();
  return c.chief_complaint?.trim() || null;
}

export function useConsultations(childId: string | null) {
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!childId) {
      setConsultations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('consultations')
      .select('*')
      .eq('child_id', childId)
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setConsultations(data ?? []);
    }
    setLoading(false);
  }, [childId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { consultations, loading, error, refetch: fetch };
}
