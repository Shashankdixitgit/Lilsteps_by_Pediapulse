'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';

export function LoginForm({ initialError, next }: { initialError: string | null; next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    initialError ? { error: initialError } : null,
  );

  return (
    <form action={formAction} className="space-y-7 fade-up" style={{ animationDelay: '80ms' }}>
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label
          htmlFor="email"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="editorial-input mt-1"
          placeholder="dr.you@clinic.in"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="editorial-input mt-1"
          placeholder="••••••••"
        />
      </div>

      {state?.error && (
        <p role="alert" className="border-l-2 border-[var(--alert)] pl-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--alert)]">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="editorial-btn w-full">
        {pending ? 'Signing in…' : 'Enter'}
      </button>

      <Link href="/login/forgot" className="link-underline mx-auto block w-fit text-center text-[13px] text-[var(--ink-3)]">
        Forgot password?
      </Link>
    </form>
  );
}
