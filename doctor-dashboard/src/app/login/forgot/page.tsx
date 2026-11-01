import { ForgotForm } from './forgot-form';

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen w-full flex-1 items-center justify-center px-8 py-16">
      <div className="w-full max-w-md">
        <div className="mb-12 fade-up">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
            LilSteps · Clinical Dashboard
          </div>
          <div className="mt-3 h-px w-12 bg-[var(--ink)]" />
          <h1 className="mt-6 font-display text-[40px] leading-tight text-[var(--ink)]">Reset your password</h1>
          <p className="mt-3 max-w-sm text-[15px] leading-[1.5] text-[var(--ink-3)]">
            We&apos;ll email you a 6-digit code to set a new password.
          </p>
        </div>
        <ForgotForm />
      </div>
    </main>
  );
}
