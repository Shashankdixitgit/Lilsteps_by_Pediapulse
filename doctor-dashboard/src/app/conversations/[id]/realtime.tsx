'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { markThreadReadAction } from './actions';

/**
 * Re-renders the open thread when a message arrives, without a manual
 * refresh. Side-effect only — renders nothing.
 *
 * Realtime delivers these events without the row (payload.new is empty for
 * this table), so a `conversation_id=eq.` filter never matches and the
 * thread used to stay stale. Instead it listens to every message this doctor
 * can see (RLS limits it to their threads), marks this thread's parent
 * messages read (the doctor has it open, so the unread badge must not count
 * them), then refreshes. Debounced so a burst costs one round trip.
 */
export function MessagesRealtime({ conversationId }: { conversationId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      // A fresh topic per mount: re-joining a topic right after leaving it
      // (StrictMode, fast navigation) can race the old channel's teardown.
      .channel(`dashboard-messages:${conversationId}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          void markThreadReadAction(conversationId)
            .catch(() => {})
            .then(() => router.refresh());
        }, 300);
      })
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  return null;
}
