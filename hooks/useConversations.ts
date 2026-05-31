import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';

export interface ConversationRow {
  id: string;
  child_id: string;
  parent_id: string;
  doctor_id: string;
  appointment_id: string | null;
  last_message_at: string;
  created_at: string;
  // joined
  doctors?: { name: string; specialisation: string; hospital: string };
  children?: { name: string };
}

export function useConversations(childId: string | null) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setConversations([]);
      return;
    }
    setLoading(true);
    setError(null);

    let q = supabase
      .from('conversations')
      .select('*, doctors(name, specialisation, hospital), children(name)')
      .eq('parent_id', user.id)
      .order('last_message_at', { ascending: false });

    if (childId) q = q.eq('child_id', childId);

    const { data, error: err } = await q;
    if (err) setError(err.message);
    else setConversations(data ?? []);
    setLoading(false);
  }, [user, childId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function startConversation(params: {
    child_id: string;
    doctor_id: string;
    appointment_id?: string;
  }): Promise<ConversationRow> {
    if (!user) throw new Error('Not authenticated');

    // Try to find an existing conversation for this child↔doctor pair.
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('child_id', params.child_id)
      .eq('doctor_id', params.doctor_id)
      .maybeSingle();

    if (existing) return existing as ConversationRow;

    const { data, error: err } = await supabase
      .from('conversations')
      .insert({
        child_id: params.child_id,
        parent_id: user.id,
        doctor_id: params.doctor_id,
        appointment_id: params.appointment_id ?? null,
      })
      .select()
      .single();

    if (err) throw new Error(err.message);
    await fetch();
    return data as ConversationRow;
  }

  return { conversations, loading, error, startConversation, refetch: fetch };
}
