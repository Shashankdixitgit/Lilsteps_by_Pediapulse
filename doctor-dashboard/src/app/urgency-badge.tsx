import type { Urgency } from '@/lib/appointments';

/**
 * AI check-in urgency, in the same colours as the calendar events: "Urgent"
 * is a coral pill, "See in 1–2 days" (soon) an amber one. Routine shows
 * nothing so the flags stand out.
 */
export function UrgencyBadge({ urgency, className }: { urgency: Urgency | null | undefined; className?: string }) {
  if (urgency === 'urgent') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#b93d27] bg-[#b93d27] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white ${className ?? ''}`}
      >
        ⚠ Urgent
      </span>
    );
  }
  if (urgency === 'soon') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--amber)] bg-[#fff1d9] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a4a06] ${className ?? ''}`}
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

/**
 * The family booked this consult with their LilSteps Care Plan (0053,
 * appointments.paid_with_plan) instead of paying ₹449. Doctors see only
 * that, never an amount.
 */
export function CarePlanBadge({ className }: { className?: string }) {
  return (
    <span
      title="Booked with the family's Care Plan"
      className={`inline-flex items-center whitespace-nowrap rounded-full border border-[var(--accent)] bg-[var(--accent-pale)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)] ${className ?? ''}`}
    >
      Care Plan
    </span>
  );
}
