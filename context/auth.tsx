import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { dbg } from '@/lib/debug';
import { WEB_DEMO } from '@/lib/webDemo';
import { analytics, crash } from '@/lib/observability';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  hasChildren: boolean | null;
  /** Send an OTP SMS to the given phone in E.164 format (e.g. +919876543210) */
  signInWithOtp: (phone: string) => Promise<{ error: string | null }>;
  /** Verify the 6-digit SMS code */
  verifyOtp: (phone: string, token: string) => Promise<{ error: string | null; isNewUser: boolean }>;
  signOut: () => Promise<void>;
  refreshHasChildren: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Testing-only bypass (EXPO_PUBLIC_DEMO_LOGIN=1 in .env): no SMS is sent and
 * any code is accepted. Each phone number maps to its own email/password
 * account, so logging in again with the same number returns the same data.
 * Remove the env var to go back to real SMS OTP. Never active in release
 * builds (__DEV__ is false there), even if the env var is set, except the
 * hosted web demo (lib/webDemo), which is web only.
 */
export const DEMO_LOGIN = (__DEV__ && process.env.EXPO_PUBLIC_DEMO_LOGIN === '1') || WEB_DEMO;

/**
 * What a parent types in the phone field, reduced to the 10-digit Indian
 * mobile number (the field shows a fixed "+91" in front). A pasted or typed
 * "+91…", "91…" (12 digits) or trunk "0…" prefix is dropped, and anything
 * past 10 digits is cut, so "+91 98765 43210" and "098765 43210" both
 * become "9876543210".
 */
export function toMobileDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2).replace(/^0+/, '');
  return digits.slice(0, 10);
}

const AUTH_COPY = {
  offline: "We couldn't reach LilSteps. Check your internet connection and try again.",
  rateLimit: 'Too many tries. Please wait a minute, then try again.',
  smsFailed: "We couldn't send the code right now. Please try again in a few minutes.",
  badPhone: "That number doesn't look right. Enter your 10-digit mobile number.",
  badCode: "That code didn't work. Check it, or tap Resend code for a new one.",
  generic: 'Something went wrong. Please try again.',
  // Only reachable from the dev-only demo login (password accounts); real
  // SMS sign-in has no password.
  passwordPolicy: "This test account couldn't be created because its password doesn't meet the sign-in rules. Please tell the LilSteps team.",
} as const;

/**
 * Plain-English text for a sign-in error. Provider text (Twilio messages,
 * error URLs, codes) is never shown: it is logged by the caller instead.
 */
export function authErrorText(error: unknown, step: 'send' | 'verify'): string {
  const e = error as Partial<AuthError> & { name?: string; message?: string };
  const code = (e?.code ?? '').toString();
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const msg = (e?.message ?? '').toLowerCase();

  if (e?.name === 'AuthRetryableFetchError' || status === 0 || /failed to fetch|network/.test(msg)) {
    return AUTH_COPY.offline;
  }
  if (status === 429 || code.startsWith('over_') || /rate limit|too many/.test(msg)) {
    return AUTH_COPY.rateLimit;
  }
  if (status !== undefined && status >= 500) {
    return step === 'send' ? AUTH_COPY.smsFailed : AUTH_COPY.generic;
  }
  if (code === 'weak_password' || /password should|password must|weak password|password.*(characters|contain)/.test(msg)) {
    return AUTH_COPY.passwordPolicy;
  }
  if (step === 'verify' && (code === 'otp_expired' || code === 'otp_disabled' || /token|otp|expired|invalid/.test(msg))) {
    return AUTH_COPY.badCode;
  }
  if (code === 'validation_failed' || /invalid phone|phone number/.test(msg)) {
    return AUTH_COPY.badPhone;
  }
  if (step === 'send') return AUTH_COPY.smsFailed;
  return AUTH_COPY.generic;
}

/**
 * DEV / WEB DEMO ONLY (reachable only when DEMO_LOGIN): each
 * phone maps to its own email/password test account. The password meets the
 * Auth password policy (lower + upper case + digit); accounts created before
 * that policy still use the old password, so sign-in falls back to it.
 */
async function demoSignIn(phone: string) {
  if (!DEMO_LOGIN) throw new Error('Demo login is only available in development builds');
  const digits = phone.replace(/\D/g, '');
  const email = `phone-${digits}@demo.lilsteps.dev`;
  const password = `Demo-${digits}-Lilsteps1`;
  const legacyPassword = `demo-${digits}-lilsteps`;
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signIn.error) return signIn;
  const legacy = await supabase.auth.signInWithPassword({ email, password: legacyPassword });
  if (!legacy.error) return legacy;
  const signUp = await supabase.auth.signUp({ email, password, options: { data: { phone } } });
  // An existing account whose password matched neither: signUp answers with
  // no session (and no error), so say so instead of a blank sign-in.
  if (!signUp.error && !signUp.data.session) {
    return { data: signUp.data, error: legacy.error };
  }
  return signUp;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasChildren, setHasChildren] = useState<boolean | null>(null);
  const checkInFlight = useRef(false);

  useEffect(() => {
    dbg.auth('Initializing auth listener');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        dbg.auth('onAuthStateChange', { event, userId: newSession?.user?.id ?? null });

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          setSession(newSession);
          if (newSession?.user) {
            crash.setUser(newSession.user.id);
            analytics.identify(newSession.user.id);
            checkChildren(newSession.user.id);
          } else {
            dbg.auth('No user in session, setting loading=false');
            setHasChildren(null);
            setLoading(false);
          }
        } else if (event === 'SIGNED_OUT') {
          dbg.auth('User signed out');
          crash.setUser(null);
          analytics.reset();
          setSession(null);
          setHasChildren(null);
          setLoading(false);
        } else if (event === 'TOKEN_REFRESHED' && newSession) {
          dbg.auth('Token refreshed silently');
          setSession(newSession);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function checkChildren(userId: string) {
    if (checkInFlight.current) {
      dbg.auth('checkChildren skipped — already in flight');
      return;
    }
    checkInFlight.current = true;
    dbg.auth('checkChildren', { userId });

    try {
      const { count, error } = await supabase
        .from('children')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', userId);

      if (error) {
        dbg.authError('checkChildren query', error);
        setHasChildren(false);
      } else {
        dbg.auth('checkChildren result', { count });
        setHasChildren((count ?? 0) > 0);
      }
    } catch (e) {
      dbg.authError('checkChildren exception', e);
      setHasChildren(false);
    } finally {
      checkInFlight.current = false;
      setLoading(false);
    }
  }

  async function signInWithOtp(phone: string): Promise<{ error: string | null }> {
    dbg.auth('signInWithOtp', { phone });

    if (DEMO_LOGIN) return { error: null };

    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true },
    });

    if (error) {
      dbg.authError('signInWithOtp', error);
      crash.captureMessage(`auth send failed: ${error.code ?? error.status ?? 'unknown'}`, 'warning');
      return { error: authErrorText(error, 'send') };
    }

    dbg.auth('signInWithOtp success — OTP sent');
    analytics.track('auth_otp_sent');
    return { error: null };
  }

  async function verifyOtp(phone: string, token: string): Promise<{ error: string | null; isNewUser: boolean }> {
    dbg.auth('verifyOtp', { phone, tokenLength: token.length });

    if (!DEMO_LOGIN && (token.length !== 6 || !/^\d{6}$/.test(token))) {
      dbg.authError('verifyOtp', 'Invalid OTP format');
      return { error: 'Enter the 6-digit code from the SMS.', isNewUser: false };
    }

    const { data, error } = DEMO_LOGIN
      ? await demoSignIn(phone)
      : await supabase.auth.verifyOtp({
          phone,
          token,
          type: 'sms',
        });

    if (error) {
      dbg.authError('verifyOtp', error);
      return { error: authErrorText(error, 'verify'), isNewUser: false };
    }

    dbg.auth('verifyOtp success', { userId: data.user?.id });

    if (data.user) {
      // Ensure parent row exists (fallback if trigger failed)
      await ensureParentRow(data.user.id, phone);

      try {
        const { count, error: countErr } = await supabase
          .from('children')
          .select('*', { count: 'exact', head: true })
          .eq('parent_id', data.user.id);

        if (countErr) {
          dbg.authError('verifyOtp children check', countErr);
          setHasChildren(false);
          return { error: null, isNewUser: true };
        }

        const isNew = (count ?? 0) === 0;
        dbg.auth('verifyOtp children check', { count, isNewUser: isNew });
        setHasChildren(!isNew);
        return { error: null, isNewUser: isNew };
      } catch (e) {
        dbg.authError('verifyOtp children check exception', e);
        setHasChildren(false);
        return { error: null, isNewUser: true };
      }
    }

    return { error: null, isNewUser: true };
  }

  /**
   * Fallback: If the DB trigger `handle_new_user` failed to create
   * the parent row, create it here. Uses upsert so it's safe to call
   * even if the row already exists.
   */
  async function ensureParentRow(userId: string, phone: string) {
    dbg.db('ensureParentRow', { userId, phone });

    const { error } = await supabase
      .from('parents')
      .upsert(
        { id: userId, phone },
        { onConflict: 'id' }
      );

    if (error) {
      dbg.dbError('ensureParentRow upsert failed', error);
      // Don't throw — this is a fallback, not critical path
    } else {
      dbg.db('ensureParentRow success');
    }
  }

  async function signOut() {
    dbg.auth('signOut');
    await supabase.auth.signOut();
    setSession(null);
    setHasChildren(null);
  }

  async function refreshHasChildren() {
    if (session?.user) {
      dbg.auth('refreshHasChildren');
      checkInFlight.current = false;
      await checkChildren(session.user.id);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        hasChildren,
        signInWithOtp,
        verifyOtp,
        signOut,
        refreshHasChildren,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
