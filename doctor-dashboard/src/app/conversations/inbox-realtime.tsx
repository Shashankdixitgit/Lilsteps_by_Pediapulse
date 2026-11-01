'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

/**
 * Re-renders the inbox when a message lands in any of this doctor's threads
 * (RLS limits the feed to them), so rows reorder and "new" counts update
 * live. Debounced so a burst of messages costs one refresh. Idle while a
 * thread is open. Renders nothing.
 */
export function InboxRealtime() {
  const router = useRouter();
  // With a thread open, its own listener (MessagesRealtime) refreshes the
  // whole page, list included: one listener, one refresh.
  const inThread = /^\/conversations\/[^/]+/.test(usePathname() ?? '');

  useEffect(() => {
    if (inThread) return;
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A fresh topic per mount: it re-subscribes each time the doctor comes
    // back to the list, and re-joining a topic right after leaving it can
    // race the old channel's teardown.
    const channel = supabase
      .channel(`dashboard-inbox:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 400);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, inThread]);

  return null;
}
