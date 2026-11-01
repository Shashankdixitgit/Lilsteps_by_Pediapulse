'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { resetPasswordAction, sendResetCodeAction, type ForgotState } from './actions';

const LABEL = 'font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]';

function ErrorLine({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="border-l-2 border-[var(--alert)] pl-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--alert)]"
    >
      {message}
    </p>
  );
}

export function ForgotForm() {
  const [sendState, sendAction, sending] = useActionState<ForgotState, FormData>(sendResetCodeAction, null);
  const [resetState, resetAction, resetting] = useActionState<ForgotState, FormData>(resetPasswordAction, null);

  const sent = resetState?.sent ?? sendState?.sent;
  const email = resetState?.email ?? sendState?.email ?? '';

  if (!sent) {
    return (
      <form action={sendAction} className="space-y-7 fade-up">
        <div>
          <label htmlFor="email" className={LABEL}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={email}
            className="editorial-input mt-1"
            placeholder="dr.you@clinic.in"
          />
        </div>
        <ErrorLine message={sendState?.error} />
        <button type="submit" disabled={sending} className="editorial-btn w-full">
          {sending ? 'Sending…' : 'Email me a code'}
        </button>
        <Link href="/login" className="block text-center text-[13px] text-[var(--ink-3)] underline">
          Back to sign in
        </Link>
      </form>
    );
  }

  return (
    <div className="space-y-7 fade-up">
      <p className="text-[15px] leading-[1.5] text-[var(--ink-3)]">
        If {email} has a dashboard login, we sent it a 6-digit code. Enter it with your new password.
      </p>
      <form action={resetAction} className="space-y-7">
        <input type="hidden" name="email" value={email} />
        <div>
          <label htmlFor="code" className={LABEL}>
            Code from the email
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className="editorial-input mt-1 tracking-[0.3em]"
            placeholder="6-digit code"
          />
        </div>
        <div>
          <label htmlFor="password" className={LABEL}>
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="editorial-input mt-1"
            placeholder="At least 8 characters"
          />
        </div>
        <ErrorLine message={resetState?.error} />
        <button type="submit" disabled={resetting} className="editorial-btn w-full">
          {resetting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
      <form action={sendAction}>
        <input type="hidden" name="email" value={email} />
        <button type="submit" disabled={sending} className="w-full text-center text-[13px] text-[var(--ink-3)] underline">
          {sending ? 'Sending…' : "Didn't get it? Send a new code"}
        </button>
      </form>
    </div>
  );
}
