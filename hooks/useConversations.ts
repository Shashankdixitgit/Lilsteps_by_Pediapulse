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
  /** Latest message text (either side), for the Messages list. */
  last_message?: { content: string; sender: 'parent' | 'doctor'; created_at: string } | null;
  /** Doctor messages the parent hasn't opened yet. */
  unread_count?: number;
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
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as ConversationRow[];

    // Previews + unread counts in one query (newest first, so the first
    // message seen per conversation is its latest).
    if (rows.length > 0) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id, content, sender, read_at, created_at')
        .in('conversation_id', rows.map((r) => r.id))
        .order('created_at', { ascending: false })
        .limit(500);
      const latest = new Map<string, ConversationRow['last_message']>();
      const unread = new Map<string, number>();
      for (const m of (msgs ?? []) as {
        conversation_id: string;
        content: string;
        sender: 'parent' | 'doctor';
        read_at: string | null;
        created_at: string;
      }[]) {
        if (!latest.has(m.conversation_id)) {
          latest.set(m.conversation_id, { content: m.content, sender: m.sender, created_at: m.created_at });
        }
        if (m.sender === 'doctor' && !m.read_at) {
          unread.set(m.conversation_id, (unread.get(m.conversation_id) ?? 0) + 1);
        }
      }
      for (const r of rows) {
        r.last_message = latest.get(r.id) ?? null;
        r.unread_count = unread.get(r.id) ?? 0;
      }
    }
    setConversations(rows);
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
    const findExisting = async () => {
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('child_id', params.child_id)
        .eq('doctor_id', params.doctor_id)
        .maybeSingle();
      return existing as ConversationRow | null;
    };

    const existing = await findExisting();
    if (existing) return existing;

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

    if (err) {
      // A double tap (or a second device) created the chat between our
      // lookup and the insert: the unique (child, doctor) index answers
      // 23505, and the chat that won is the one to open.
      if (err.code === '23505') {
        const winner = await findExisting();
        if (winner) {
          await fetch();
          return winner;
        }
      }
      throw new Error(err.message);
    }
    await fetch();
    return data as ConversationRow;
  }

  return { conversations, loading, error, startConversation, refetch: fetch };
}
