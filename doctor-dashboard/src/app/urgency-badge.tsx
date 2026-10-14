import type { Urgency } from '@/lib/appointments';

/**
 * AI check-in urgency. The palette is monochrome, so urgency is carried by
 * weight: "Urgent" is a filled ink pill, "See in 1–2 days" (soon) an outlined
 * one. Routine shows nothing so the flags stand out.
 */
export function UrgencyBadge({ urgency, className }: { urgency: Urgency | null | undefined; className?: string }) {
  if (urgency === 'urgent') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ink)] bg-[var(--ink)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--paper)] ${className ?? ''}`}
      >
        ⚠ Urgent
      </span>
    );
  }
  if (urgency === 'soon') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--ink)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink)] ${className ?? ''}`}
      >
        See in 1–2 days
      </span>
    );
  }
  return null;
}

/** Today's open visit whose slot time has passed. */
export function LateBadge({ className }: { className?: string }) {
  return (
    <span
      title="The slot time has passed and the visit is not closed yet"
      className={`inline-flex items-center rounded-full border border-dashed border-[var(--ink)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink)] ${className ?? ''}`}
    >
      Late
    </span>
  );
}
