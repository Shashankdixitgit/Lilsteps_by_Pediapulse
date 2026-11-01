'use server';

import { redirect } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ForgotState = { error?: string; email?: string; sent?: boolean; verified?: boolean } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Email codes: Supabase sends 6 by default (6–10 is configurable). */
const CODE_RE = /^\d{6,10}$/;

const SEND_LIMIT = { max: 3, windowSeconds: 3600 }; // codes per email per hour
const VERIFY_LIMIT = { max: 5, windowSeconds: 600 }; // code guesses per email per 10 minutes

const COPY = {
  unavailable: "Password reset isn't available right now. Please ask the LilSteps team to reset it for you.",
  tooManyEmails: 'Too many emails right now — try again in a few minutes.',
  tooManyTries: 'Too many tries. Send a new code and try again in a few minutes.',
} as const;

/** Plain wording for Supabase Auth errors; provider text is never shown. */
function friendly(error: { code?: string; status?: number; message?: string }, step: 'send' | 'reset'): string {
  const msg = (error.message ?? '').toLowerCase();
  if (error.status === 429 || error.code?.startsWith('over_') || /rate limit|security purposes/.test(msg)) {
    return COPY.tooManyEmails;
  }
  if (error.code === 'same_password') return 'Choose a password different from your old one.';
  if (/pwned|breach|compromised/.test(msg)) {
    return 'This password has appeared in a data breach. Please choose a different one.';
  }
  if (error.code === 'weak_password' || /password/.test(msg)) {
    return 'Choose a stronger password: at least 8 characters, with upper-case and lower-case letters and a number.';
  }
  if (step === 'reset' && (error.code === 'otp_expired' || /token|otp|expired|invalid/.test(msg))) {
    return "That code didn't work. Check the latest email, or send a new code.";
  }
  return step === 'send'
    ? "We couldn't send the email right now. Please try again in a few minutes."
    : 'Something went wrong. Please try again.';
}

/** Step 1: email a reset code — only to doctor dashboard logins, at most 3 an hour. */
export async function sendResetCodeAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Enter the email address you sign in with' };

  const admin = createSupabaseAdminClient();
  if (!admin) return { email, error: COPY.unavailable };

  const { data: allowed, error: limitErr } = await admin.rpc('note_auth_attempt', {
    p_key: `dash-reset-send:${email}`,
    p_max: SEND_LIMIT.max,
    p_window_seconds: SEND_LIMIT.windowSeconds,
  });
  if (limitErr) return { email, error: COPY.unavailable };
  if (!allowed) return { email, error: COPY.tooManyEmails };

  const { data: isDoctor, error: lookupErr } = await admin.rpc('is_dashboard_login', { p_email: email });
  if (lookupErr) return { email, error: COPY.unavailable };

  if (isDoctor) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { email, error: friendly(error, 'send') };
  }
  // Same answer whether or not the address is a doctor login.
  return { email, sent: true };
}

/**
 * Step 2: check the code (this signs the doctor in), then set the new
 * password. A code works once: if the password is then refused (too weak,
 * same as before), the retry only sets the password — `verified` hides the
 * code field and the session from the first try is reused.
 */
export async function resetPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const token = String(formData.get('code') ?? '').replace(/\D/g, '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const verified = !!user && user.email?.toLowerCase() === email;
  const back: ForgotState = { email, sent: true, verified };

  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return {
      ...back,
      error: 'Use at least 8 characters, with upper-case and lower-case letters and a number.',
    };
  }

  if (!verified) {
    if (!CODE_RE.test(token)) return { ...back, error: 'Enter the code from the email' };
    const admin = createSupabaseAdminClient();
    if (!admin) return { ...back, error: COPY.unavailable };
    const { data: allowed, error: limitErr } = await admin.rpc('note_auth_attempt', {
      p_key: `dash-reset-verify:${email}`,
      p_max: VERIFY_LIMIT.max,
      p_window_seconds: VERIFY_LIMIT.windowSeconds,
    });
    if (limitErr) return { ...back, error: COPY.unavailable };
    if (!allowed) return { ...back, error: COPY.tooManyTries };

    const { error: verifyErr } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
    if (verifyErr) return { ...back, error: friendly(verifyErr, 'reset') };
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password });
  if (updateErr) return { email, sent: true, verified: true, error: friendly(updateErr, 'reset') };

  // proxy.ts sends anyone who isn't a doctor back to /login with a message.
  redirect('/');
}
