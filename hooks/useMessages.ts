import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { dbg } from '@/lib/debug';
import { notify } from '@/lib/notify';

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender: 'parent' | 'doctor';
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (err) setError(err.message);
    else setMessages((data ?? []) as MessageRow[]);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Realtime: subscribe to new messages in this conversation.
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          dbg.hook('useMessages: realtime insert', { id: payload.new.id });
          setMessages((prev) => {
            // Avoid duplicates if the local send also returned the row.
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as MessageRow];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  async function send(content: string) {
    if (!conversationId || !user) throw new Error('Missing conversation or user');
    if (!content.trim()) return;
    if (sendingRef.current) return;
    sendingRef.current = true;

    try {
      const { data, error: err } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender: 'parent',
          sender_id: user.id,
          content: content.trim(),
        })
        .select()
        .single();

      if (err) throw new Error(err.message);

      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, data as MessageRow],
      );

      // Push the doctor on the other side. The function looks up the doctor's
      // push token via their auth user id; for MVP we skip since the doctor
      // dashboard is a web app — they get realtime in-app instead.
      // (Kept here as a hook for future native doctor app.)
    } finally {
      sendingRef.current = false;
    }
  }

  async function markRead(messageIds: string[]) {
    if (messageIds.length === 0) return;
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', messageIds)
      .is('read_at', null);
  }

  return { messages, loading, error, send, markRead, refetch: fetchMessages };
}
