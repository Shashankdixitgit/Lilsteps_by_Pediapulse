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

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('dashboard-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        void refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  if (count === 0) return null;
  return (
    <span
      aria-label={`${count} unread`}
      className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--ink)] px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none tracking-normal text-[var(--paper)]"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
