import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center px-4 py-24 sm:px-8">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Not found</div>
      <h1 className="mt-2 font-display text-[36px] leading-tight text-[var(--ink)]">This page doesn&apos;t exist</h1>
      <p className="mt-3 text-[15px] leading-[1.55] text-[var(--ink-3)]">
        The link may be old, or the item was removed.
      </p>
      <Link href="/" className="editorial-btn mt-8">
        Back to queue
      </Link>
    </main>
  );
}
