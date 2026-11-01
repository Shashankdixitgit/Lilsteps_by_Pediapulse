'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ForgotState = { error?: string; email?: string; sent?: boolean } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Plain wording for Supabase Auth errors; provider text is never shown. */
function friendly(error: { code?: string; status?: number; message?: string }, step: 'send' | 'reset'): string {
  const msg = (error.message ?? '').toLowerCase();
  if (error.status === 429 || error.code?.startsWith('over_') || /rate limit|security purposes/.test(msg)) {
    return 'Too many tries. Please wait a minute, then try again.';
  }
  if (error.code === 'same_password') return 'Choose a password different from your old one.';
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

/** Step 1: email a 6-digit reset code. */
export async function sendResetCodeAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Enter the email address you sign in with' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) return { email, error: friendly(error, 'send') };
  // Same answer whether or not the address has an account.
  return { email, sent: true };
}

/** Step 2: check the code (this signs the doctor in), then set the new password. */
export async function resetPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const token = String(formData.get('code') ?? '').replace(/\D/g, '');
  const password = String(formData.get('password') ?? '');
  const back = { email, sent: true };

  if (token.length !== 6) return { ...back, error: 'Enter the 6-digit code from the email' };
  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return {
      ...back,
      error: 'Use at least 8 characters, with upper-case and lower-case letters and a number.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
  if (verifyErr) return { ...back, error: friendly(verifyErr, 'reset') };

  const { error: updateErr } = await supabase.auth.updateUser({ password });
  if (updateErr) return { ...back, error: friendly(updateErr, 'reset') };

  // proxy.ts sends anyone who isn't a doctor back to /login with a message.
  redirect('/');
}
