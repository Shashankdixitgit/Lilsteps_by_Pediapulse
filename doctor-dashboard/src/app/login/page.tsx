import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const initialError =
    error === 'not_a_doctor'
      ? 'This account is not authorised for the clinical dashboard.'
      : null;

  return (
    <main className="flex min-h-screen w-full flex-1 items-center justify-center px-8 py-16">
      <div className="w-full max-w-md">
        {/* Masthead */}
        <div className="mb-14 fade-up">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
            Pedia Pulse · Est. 2026
          </div>
          <div className="mt-3 h-px w-12 bg-[var(--ink)]" />
          <h1 className="mt-6 font-display text-[56px] leading-[0.95] tracking-[-0.03em] text-[var(--ink)]">
            <span className="font-display-italic">Welcome,</span>
            <br />
            Doctor.
          </h1>
          <p className="mt-5 max-w-sm font-display-italic text-[17px] leading-[1.5] text-[var(--ink-2)]">
            Sign in to attend to today&apos;s consultations.
          </p>
        </div>

        <LoginForm initialError={initialError} />

        <div className="mt-16 border-t border-[var(--hairline)] pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-4)]">
          Vol. I · No. 1 · Pune
        </div>
      </div>
    </main>
  );
}
