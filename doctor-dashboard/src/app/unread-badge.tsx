'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

/**
 * Count of parent messages the doctor hasn't opened yet, next to "Messages".
 * RLS limits messages to this doctor's own threads. Recounts on every
 * navigation (opening a thread marks it read) and on new messages.
 */
export function UnreadBadge() {
  const [count, setCount] = useState(0);
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { count: n, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender', 'parent')
      .is('read_at', null);
    if (!error) setCount(n ?? 0);
  }, []);

  useEffect(() => {
    // Async fetch; the state update lands after the effect returns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh, pathname]);

  // New messages and read receipts (read_at UPDATEs). Debounced: when a
  // message lands in the thread the doctor has open, the thread marks it read
  // a moment later, so recounting straight away would flash a stale badge.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 1500);
    };
    const channel = supabase
      .channel('dashboard-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, later)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  if (count === 0) return null;
  return (
    <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--ink)] px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none tracking-normal text-[var(--paper)]">
      <span aria-hidden>{count > 99 ? '99+' : count}</span>
      <span className="sr-only">, {count} unread</span>
    </span>
  );
}
