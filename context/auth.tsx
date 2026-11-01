import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { dbg } from '@/lib/debug';
import { WEB_DEMO } from '@/lib/webDemo';
import { analytics, crash } from '@/lib/observability';
import { haptic } from '@/components/ui/useMotion';

/** Which email code is being checked: sign-up, sign-in, password reset, or adding an email. */
export type EmailCodeKind = 'signup' | 'email' | 'recovery' | 'email_change';

/**
 * Email codes: Supabase sends 6 digits by default (6–10 is configurable in
 * Auth settings), so the code field accepts any length in that range.
 */
export const EMAIL_CODE_LENGTH = { min: 6, max: 10 } as const;

export function isEmailCode(token: string): boolean {
  return new RegExp(`^\\d{${EMAIL_CODE_LENGTH.min},${EMAIL_CODE_LENGTH.max}}$`).test(token);
}

interface SignInResult {
  error: string | null;
  isNewUser: boolean;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  hasChildren: boolean | null;
  /** PHONE_AUTH only: send an OTP SMS to the given phone in E.164 format (e.g. +919876543210) */
  signInWithOtp: (phone: string) => Promise<{ error: string | null }>;
  /** PHONE_AUTH only: verify the 6-digit SMS code */
  verifyOtp: (phone: string, token: string) => Promise<SignInResult>;
  /**
   * Create an email + password account. `needsCode`: a 6-digit code was
   * emailed and must be checked with verifyEmailCode(…, 'signup').
   */
  signUpWithEmail: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsCode: boolean; isNewUser: boolean }>;
  /** Sign in with email + password. `needsCode`: the address isn't confirmed yet; a new code was sent. */
  signInWithPassword: (email: string, password: string) => Promise<SignInResult & { needsCode: boolean }>;
  /** Email a 6-digit sign-in code to an existing account. */
  sendLoginCode: (email: string) => Promise<{ error: string | null }>;
  /** Email a new sign-up confirmation code. */
  resendSignupCode: (email: string) => Promise<{ error: string | null }>;
  /** Email a 6-digit password-reset code. */
  sendPasswordResetCode: (email: string) => Promise<{ error: string | null }>;
  /** Check a 6-digit email code; on success the parent is signed in. */
  verifyEmailCode: (email: string, token: string, kind: EmailCodeKind) => Promise<SignInResult>;
  /** Set a new password for the signed-in parent (after a reset code). */
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  /** Signed-in parent with no email (phone sign-up): email a code to add this address. */
  addEmail: (email: string) => Promise<{ error: string | null }>;
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
 * Sign-in by phone + SMS code. OFF: SMS is not set up (DLT), so parents sign
 * up and sign in with email (password or a 6-digit email code). Turn on with
 * EXPO_PUBLIC_PHONE_AUTH=1 once an SMS provider is live.
 */
export const PHONE_AUTH = process.env.EXPO_PUBLIC_PHONE_AUTH === '1';

/** Test-login domain (dev demo login and the hosted web demo). Never shown to parents. */
export const DEMO_EMAIL_DOMAIN = '@demo.lilsteps.dev';

/** The demo email + password account for a 10-digit test number. */
export function demoCredentials(digits: string) {
  const d = digits.replace(/\D/g, '');
  return {
    email: `phone-${d}${DEMO_EMAIL_DOMAIN}`,
    password: `Demo-${d}-Lilsteps1`,
    legacyPassword: `demo-${d}-lilsteps`,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** One canonical address per parent: trimmed, lower case. */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

/**
 * The password rule (matches the Supabase Auth policy: at least 8
 * characters with a lower-case letter, an upper-case letter and a digit).
 * Returns the problem in plain words, or null when the password is fine.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Use a mix of upper-case and lower-case letters and at least one number.';
  }
  return null;
}

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
  emailFailed: "We couldn't send the email right now. Please try again in a few minutes.",
  emailRateLimit: 'Too many emails right now — try again in a few minutes.',
  alreadyExists: 'This email already has an account. Sign in or reset your password.',
  pwned: 'This password has appeared in a data breach elsewhere. Please choose a different one.',
  badEmail: "That email address doesn't look right. Please check it.",
  wrongPassword: "That email and password don't match. Try again, or sign in with a code instead.",
  weakPassword: 'Choose a stronger password: at least 8 characters, with upper-case and lower-case letters and a number.',
  samePassword: 'Your new password must be different from the old one.',
  emailCodeBad: "That code didn't work. Check the latest email, or tap Resend code for a new one.",
} as const;

/** "No such account" answers to a sign-in code request: shown to the parent as sent anyway. */
export function isNoAccountError(error: unknown): boolean {
  const e = error as Partial<AuthError> & { message?: string };
  const code = (e?.code ?? '').toString();
  return code === 'otp_disabled' || code === 'user_not_found' || /signups not allowed for otp|user not found/i.test(e?.message ?? '');
}

/**
 * Plain-English text for an email sign-in error. Provider text is never
 * shown: callers log it instead.
 */
export function emailAuthErrorText(
  error: unknown,
  step: 'signup' | 'password' | 'send' | 'verify' | 'update',
): string {
  const e = error as Partial<AuthError> & { name?: string; message?: string };
  const code = (e?.code ?? '').toString();
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const msg = (e?.message ?? '').toLowerCase();

  if (e?.name === 'AuthRetryableFetchError' || status === 0 || /failed to fetch|network/.test(msg)) {
    return AUTH_COPY.offline;
  }
  if (status === 429 || code.startsWith('over_') || /rate limit|too many|security purposes/.test(msg)) {
    // Sending steps hit the email limits; sign-in / code checks hit request limits.
    return step === 'signup' || step === 'send' ? AUTH_COPY.emailRateLimit : AUTH_COPY.rateLimit;
  }
  if (code === 'user_already_exists' || code === 'email_exists' || /already (registered|exists)/.test(msg)) {
    return AUTH_COPY.alreadyExists;
  }
  if (code === 'same_password') return AUTH_COPY.samePassword;
  const reasons = (e as { reasons?: string[] })?.reasons ?? [];
  if (reasons.includes('pwned') || /pwned|breach|compromised/.test(msg)) return AUTH_COPY.pwned;
  if (code === 'weak_password' || /password should|password must|weak password|password.*(characters|contain)/.test(msg)) {
    return AUTH_COPY.weakPassword;
  }
  if (code === 'email_address_invalid' || code === 'validation_failed' || /invalid email|email address.*invalid|unable to validate email/.test(msg)) {
    return AUTH_COPY.badEmail;
  }
  if (step === 'password' && (code === 'invalid_credentials' || /invalid login credentials/.test(msg))) {
    return AUTH_COPY.wrongPassword;
  }
  if (step === 'verify' && (code === 'otp_expired' || /token|otp|expired|invalid/.test(msg))) {
    return AUTH_COPY.emailCodeBad;
  }
  // Our sign-up guard's own message (private.hook_before_user_created) is written for parents.
  if (step === 'signup' && status === 403 && e?.message && !/http|error|hook/i.test(e.message)) {
    return e.message;
  }
  if (status !== undefined && status >= 500) {
    return step === 'send' || step === 'signup' ? AUTH_COPY.emailFailed : AUTH_COPY.generic;
  }
  if (step === 'send') return AUTH_COPY.emailFailed;
  return AUTH_COPY.generic;
}

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
  const { email, password, legacyPassword } = demoCredentials(phone);
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
    return afterSignIn(data.user, { phone });
  }

  /**
   * After any successful sign-in: make sure the parents row exists, then
   * tell the screen whether this parent still needs onboarding (no child yet).
   */
  async function afterSignIn(
    user: User | null | undefined,
    contact: { phone?: string; email?: string },
  ): Promise<SignInResult> {
    if (!user) return { error: null, isNewUser: true };
    // Ensure parent row exists (fallback if trigger failed)
    await ensureParentRow(user.id, contact);

    try {
      const { count, error: countErr } = await supabase
        .from('children')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', user.id);

      if (countErr) {
        dbg.authError('afterSignIn children check', countErr);
        setHasChildren(false);
        return { error: null, isNewUser: true };
      }

      const isNew = (count ?? 0) === 0;
      dbg.auth('afterSignIn children check', { count, isNewUser: isNew });
      setHasChildren(!isNew);
      return { error: null, isNewUser: isNew };
    } catch (e) {
      dbg.authError('afterSignIn children check exception', e);
      setHasChildren(false);
      return { error: null, isNewUser: true };
    }
  }

  // ── Email sign-in (the default while SMS is off) ────────────────────────────

  /**
   * Web demo / dev demo login: test accounts (phone-…@demo.lilsteps.dev)
   * can't receive email, so they are created already confirmed by the
   * demo-signup function, then signed in with their password.
   */
  async function demoEmailSignUp(name: string, email: string, password: string) {
    const { data, error } = await supabase.functions.invoke('demo-signup', {
      body: { email, password, name },
    });
    if (error || !data?.ok) {
      dbg.authError('demo-signup', error ?? data);
      return { error: AUTH_COPY.generic, needsCode: false, isNewUser: false };
    }
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) {
      dbg.authError('demo sign-in after signup', signIn.error);
      return { error: emailAuthErrorText(signIn.error, 'password'), needsCode: false, isNewUser: false };
    }
    const r = await afterSignIn(signIn.data.user, { email });
    return { ...r, needsCode: false };
  }

  async function signUpWithEmail(name: string, rawEmail: string, password: string) {
    const email = normaliseEmail(rawEmail);
    dbg.auth('signUpWithEmail', { email });
    if (DEMO_LOGIN && email.endsWith(DEMO_EMAIL_DOMAIN)) return demoEmailSignUp(name, email, password);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) {
      dbg.authError('signUpWithEmail', error);
      crash.captureMessage(`auth signup failed: ${error.code ?? error.status ?? 'unknown'}`, 'warning');
      return { error: emailAuthErrorText(error, 'signup'), needsCode: false, isNewUser: false };
    }
    analytics.track('auth_signup_code_sent');
    // Email confirmation is on: no session until the 6-digit code is checked.
    // An address that already has an account gets the same answer (Supabase
    // doesn't reveal which addresses exist); its owner can sign in instead.
    if (!data.session) return { error: null, needsCode: true, isNewUser: true };
    const r = await afterSignIn(data.user, { email });
    return { ...r, needsCode: false };
  }

  async function signInWithPassword(rawEmail: string, password: string) {
    const email = normaliseEmail(rawEmail);
    dbg.auth('signInWithPassword', { email });
    let { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // Demo accounts made before the password policy still use the old password.
    if (error && DEMO_LOGIN && email.endsWith(DEMO_EMAIL_DOMAIN)) {
      const digits = email.slice('phone-'.length, -DEMO_EMAIL_DOMAIN.length);
      ({ data, error } = await supabase.auth.signInWithPassword({
        email,
        password: demoCredentials(digits).legacyPassword,
      }));
    }
    if (error) {
      dbg.authError('signInWithPassword', error);
      if (error.code === 'email_not_confirmed') {
        // Finish the sign-up: send a fresh code and ask for it. If a code went
        // out under a minute ago, Supabase refuses a new one — the earlier
        // code still works, so go to the code screen anyway.
        await resendSignupCode(email);
        return { error: null, isNewUser: false, needsCode: true };
      }
      return { error: emailAuthErrorText(error, 'password'), isNewUser: false, needsCode: false };
    }
    analytics.track('auth_password_sign_in');
    const r = await afterSignIn(data.user, { email });
    return { ...r, needsCode: false };
  }

  async function sendLoginCode(rawEmail: string): Promise<{ error: string | null }> {
    const email = normaliseEmail(rawEmail);
    dbg.auth('sendLoginCode', { email });
    // Sign-in only: new parents sign up with a password first.
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) {
      dbg.authError('sendLoginCode', error);
      // Don't reveal which addresses have accounts: an unknown email gets the
      // same "if an account exists, we've sent a code" screen.
      if (isNoAccountError(error)) return { error: null };
      return { error: emailAuthErrorText(error, 'send') };
    }
    analytics.track('auth_email_code_sent');
    return { error: null };
  }

  async function resendSignupCode(rawEmail: string): Promise<{ error: string | null }> {
    const email = normaliseEmail(rawEmail);
    dbg.auth('resendSignupCode', { email });
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      dbg.authError('resendSignupCode', error);
      return { error: emailAuthErrorText(error, 'send') };
    }
    return { error: null };
  }

  async function sendPasswordResetCode(rawEmail: string): Promise<{ error: string | null }> {
    const email = normaliseEmail(rawEmail);
    dbg.auth('sendPasswordResetCode', { email });
    // The reset email carries a 6-digit code (supabase/templates/recovery.html),
    // so no redirect link or deep link is needed.
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      dbg.authError('sendPasswordResetCode', error);
      return { error: emailAuthErrorText(error, 'send') };
    }
    return { error: null };
  }

  async function verifyEmailCode(rawEmail: string, token: string, kind: EmailCodeKind): Promise<SignInResult> {
    const email = normaliseEmail(rawEmail);
    dbg.auth('verifyEmailCode', { email, kind, tokenLength: token.length });
    if (!isEmailCode(token)) {
      return { error: 'Enter the code from the email.', isNewUser: false };
    }
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: kind });
    if (error) {
      dbg.authError('verifyEmailCode', error);
      haptic('warning');
      return { error: emailAuthErrorText(error, 'verify'), isNewUser: false };
    }
    analytics.track('auth_email_code_verified', { kind });
    return afterSignIn(data.user, { email });
  }

  async function addEmail(rawEmail: string): Promise<{ error: string | null }> {
    const email = normaliseEmail(rawEmail);
    dbg.auth('addEmail', { email });
    // Sends the "Change email address" template (a code) to the new address;
    // verifyEmailCode(…, 'email_change') then attaches it to this account.
    const { error } = await supabase.auth.updateUser({ email });
    if (error) {
      dbg.authError('addEmail', error);
      return { error: emailAuthErrorText(error, 'signup') };
    }
    return { error: null };
  }

  async function updatePassword(password: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      dbg.authError('updatePassword', error);
      return { error: emailAuthErrorText(error, 'update') };
    }
    return { error: null };
  }

  /**
   * Fallback: If the DB trigger `handle_new_user` failed to create
   * the parent row, create it here. Uses upsert so it's safe to call
   * even if the row already exists.
   */
  async function ensureParentRow(userId: string, contact: { phone?: string; email?: string }) {
    dbg.db('ensureParentRow', { userId, ...contact });

    const { error } = await supabase
      .from('parents')
      .upsert(
        { id: userId, ...contact },
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
        signUpWithEmail,
        signInWithPassword,
        sendLoginCode,
        resendSignupCode,
        sendPasswordResetCode,
        verifyEmailCode,
        updatePassword,
        addEmail,
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
