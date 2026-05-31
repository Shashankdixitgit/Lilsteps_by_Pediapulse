'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { disconnectGoogleAction, saveGoogleTokenAction } from './actions';

interface Props {
  initialEmail: string | null;
}

export function GoogleLink({ initialEmail }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(initialEmail);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Right after the Google OAuth callback, Supabase puts provider tokens in
  // the session. We grab the refresh token and persist it server-side so the
  // create-meet-event Edge Function can use it later.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const sub = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION' && event !== 'TOKEN_REFRESHED') return;
      const refresh = session?.provider_refresh_token;
      if (!refresh) return;
      const userEmail = session?.user?.identities?.find((i) => i.provider === 'google')?.identity_data?.email
        ?? session?.user?.email
        ?? null;
      const res = await saveGoogleTokenAction({
        refreshToken: refresh,
        googleEmail: userEmail,
      });
      if (res.error) {
        setFeedback({ kind: 'err', msg: res.error });
      } else {
        setEmail(userEmail);
        setFeedback({ kind: 'ok', msg: 'Connected — bookings will create Meet links.' });
        router.refresh();
      }
    });
    return () => sub.data.subscription.unsubscribe();
  }, [router]);

  async function connect() {
    setFeedback(null);
    const supabase = createSupabaseBrowserClient();
    // linkIdentity adds Google as a secondary identity for the
    // already-signed-in doctor (who logs in with email + password).
    // access_type=offline + prompt=consent ensures Google issues a refresh
    // token even on subsequent connections.
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar.events',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        redirectTo: `${window.location.origin}/settings`,
      },
    });
    if (error) setFeedback({ kind: 'err', msg: error.message });
  }

  function disconnect() {
    if (!confirm('Disconnect Google Calendar? New bookings will fall back to the manual Meet link.')) return;
    startTransition(async () => {
      const res = await disconnectGoogleAction();
      if (res.error) setFeedback({ kind: 'err', msg: res.error });
      else {
        setEmail(null);
        setFeedback({ kind: 'ok', msg: 'Disconnected.' });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5 fade-up" style={{ animationDelay: '40ms' }}>
      <div className="font-display-italic text-[15px] leading-[1.55] text-[var(--ink-2)]">
        Connect once. Every appointment booking will create a Google Calendar
        event with a unique Meet link, sent to you (and emailed to the parent
        if their email is on file).
      </div>

      {email ? (
        <div className="flex items-center justify-between border-l-2 border-[var(--accent)] pl-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">
              Connected
            </div>
            <div className="mt-1 font-sans text-[15px] text-[var(--ink)]">{email}</div>
          </div>
          <button
            type="button"
            onClick={disconnect}
            disabled={pending}
            className="link-underline font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-3)] hover:text-[var(--alert)]"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button type="button" onClick={connect} className="editorial-btn">
          Connect Google Calendar
        </button>
      )}

      {feedback && (
        <p
          className={`border-l-2 pl-3 font-mono text-[11px] uppercase tracking-[0.12em] ${
            feedback.kind === 'ok'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-[var(--alert)] text-[var(--alert)]'
          }`}
        >
          {feedback.msg}
        </p>
      )}
    </div>
  );
}
