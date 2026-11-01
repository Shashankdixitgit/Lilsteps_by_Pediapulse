"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  resetPasswordAction,
  sendResetCodeAction,
  type ForgotState,
} from "./actions";

const LABEL =
  "font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]";

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
  const [sendState, sendAction, sending] = useActionState<
    ForgotState,
    FormData
  >(sendResetCodeAction, null);
  const [resetState, resetAction, resetting] = useActionState<
    ForgotState,
    FormData
  >(resetPasswordAction, null);

  const sent = resetState?.sent ?? sendState?.sent;
  const email = resetState?.email ?? sendState?.email ?? "";
  // The code has been accepted; only the new password is still needed.
  const verified = resetState?.verified === true;

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
        <button
          type="submit"
          disabled={sending}
          className="editorial-btn w-full"
        >
          {sending ? "Sending…" : "Email me a code"}
        </button>
        <Link
          href="/login"
          className="block text-center text-[13px] text-[var(--ink-3)] underline"
        >
          Back to sign in
        </Link>
      </form>
    );
  }

  return (
    <div className="space-y-7 fade-up">
      <p className="text-[15px] leading-[1.5] text-[var(--ink-3)]">
        {verified
          ? "Code accepted. Choose your new password."
          : `If ${email} has a dashboard login, we sent it a code. It expires in 10 minutes. Enter it with your new password.`}
      </p>
      <form action={resetAction} className="space-y-7">
        <input type="hidden" name="email" value={email} />
        {verified ? null : (
          <div>
            <label htmlFor="code" className={LABEL}>
              Code from the email
            </label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              required
              className="editorial-input mt-1 tracking-[0.3em]"
              placeholder="Code from the email"
            />
          </div>
        )}
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
        <button
          type="submit"
          disabled={resetting}
          className="editorial-btn w-full"
        >
          {resetting ? "Saving…" : "Save new password"}
        </button>
      </form>
      {verified ? null : (
        <form action={sendAction}>
          <input type="hidden" name="email" value={email} />
          <button
            type="submit"
            disabled={sending}
            className="w-full text-center text-[13px] text-[var(--ink-3)] underline"
          >
            {sending ? "Sending…" : "Didn't get it? Send a new code"}
          </button>
          <ErrorLine message={sendState?.sent ? undefined : sendState?.error} />
        </form>
      )}
    </div>
  );
}
