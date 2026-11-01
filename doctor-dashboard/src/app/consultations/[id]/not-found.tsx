import Link from 'next/link';

export default function ConsultationNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center px-4 py-24 sm:px-8">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Visit not found</div>
      <h1 className="mt-2 font-display text-[36px] leading-tight text-[var(--ink)]">We couldn&apos;t open this visit</h1>
      <p className="mt-3 text-[15px] leading-[1.55] text-[var(--ink-3)]">
        It may not be one of your consults, or the family hasn&apos;t finished paying for it yet. Unpaid bookings
        show up in your queue once the payment goes through.
      </p>
      <Link href="/" className="editorial-btn mt-8">
        Back to queue
      </Link>
    </main>
  );
}
