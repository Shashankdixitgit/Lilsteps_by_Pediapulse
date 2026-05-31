import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { dbg } from '@/lib/debug';
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

    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true },
    });

    if (error) {
      dbg.authError('signInWithOtp', error);
      return { error: error.message };
    }

    dbg.auth('signInWithOtp success — OTP sent');
    analytics.track('auth_otp_sent');
    return { error: null };
  }

  async function verifyOtp(phone: string, token: string): Promise<{ error: string | null; isNewUser: boolean }> {
    dbg.auth('verifyOtp', { phone, tokenLength: token.length });

    if (token.length !== 6 || !/^\d{6}$/.test(token)) {
      dbg.authError('verifyOtp', 'Invalid OTP format');
      return { error: 'OTP must be exactly 6 digits', isNewUser: false };
    }

    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });

    if (error) {
      dbg.authError('verifyOtp', error);
      return { error: error.message, isNewUser: false };
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
