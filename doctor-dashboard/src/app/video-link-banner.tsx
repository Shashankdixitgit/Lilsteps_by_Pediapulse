import Link from 'next/link';

/**
 * Shown on the queue and the consult page when the doctor has neither a
 * fallback video room nor Google Calendar connected: parents then have no
 * link to join and the visit cannot happen over video.
 */
export function VideoLinkBanner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--hairline-strong)] border-l-[3px] border-l-[var(--ink)] bg-[var(--paper-soft)] px-5 py-4 ${className ?? ''}`}
    >
      <div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink)]">
          No video link set
        </div>
        <p className="mt-1 text-[14px] leading-[1.5] text-[var(--ink-2)]">
          Parents can&apos;t join your video consults until you add a video room or connect
          Google Calendar.
        </p>
      </div>
      <Link href="/settings" className="editorial-btn shrink-0">
        Set video link
      </Link>
    </div>
  );
}
