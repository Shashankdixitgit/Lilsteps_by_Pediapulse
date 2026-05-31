'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handle() {
    const supabase = createSupabaseBrowserClient();
    startTransition(async () => {
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    });
  }

  return (
    <button
      onClick={handle}
      disabled={pending}
      className="link-underline cursor-pointer text-[13px] uppercase tracking-[0.14em] text-[var(--ink-3)] hover:text-[var(--alert)] disabled:opacity-60"
    >
      {pending ? 'Out…' : 'Sign out'}
    </button>
  );
}
