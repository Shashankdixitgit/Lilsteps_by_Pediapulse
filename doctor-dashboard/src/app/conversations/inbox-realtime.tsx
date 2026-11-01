'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

/**
 * Re-renders the inbox when a message lands in any of this doctor's threads
 * (RLS limits the feed to them), so rows reorder and "new" counts update
 * live. Debounced so a burst of messages costs one refresh. Renders nothing.
 */
export function InboxRealtime() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel('dashboard-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 400);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
