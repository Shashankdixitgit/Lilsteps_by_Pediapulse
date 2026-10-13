/**
 * Child age, onboarding path and age label: the ONE source for all three.
 *
 * Age is worked out with calendar arithmetic on local dates (years, months
 * and days, like a birthday), never as milliseconds / 365.25 days. A child
 * is 9 on their 9th birthday, all day, in every time zone.
 */
import { addCalendar, parseDateOnly, startOfLocalDay } from '@/lib/date';

/** LilSteps cares for children from birth up to (not including) the 16th birthday. */
export const MAX_AGE_YEARS = 16;

export interface AgeParts {
  /** Whole years completed. */
  years: number;
  /** Whole months completed after `years` (0–11). */
  months: number;
  /** Days completed after `years` + `months`. */
  days: number;
  /** Whole months completed since birth (years * 12 + months). */
  totalMonths: number;
  /** Days since birth (local calendar days). */
  totalDays: number;
}

/**
 * Calendar age of a child on `now` (default: today). Both dates are reduced
 * to local calendar days first, so the time of day never matters.
 * Returns null for a DOB in the future or an invalid date.
 */
export function getAgeParts(dobInput: Date | string, now: Date = new Date()): AgeParts | null {
  const dob = startOfLocalDay(parseDateOnly(dobInput));
  const today = startOfLocalDay(now);
  if (Number.isNaN(dob.getTime()) || dob > today) return null;

  let totalMonths = (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());
  // Not yet reached this month's "birth day" (clamped for short months).
  if (addCalendar(dob, { months: totalMonths }) > today) totalMonths -= 1;

  const monthAnniversary = addCalendar(dob, { months: totalMonths });
  const days = Math.round((today.getTime() - monthAnniversary.getTime()) / 86_400_000);
  const totalDays = Math.round((today.getTime() - dob.getTime()) / 86_400_000);

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days,
    totalMonths,
    totalDays,
  };
}

/** True for a real date that is today or earlier and before the 16th birthday. */
export function isDobInRange(dob: Date | string, now: Date = new Date()): boolean {
  const age = getAgeParts(dob, now);
  return age !== null && age.years < MAX_AGE_YEARS;
}

/** True when the DOB is after today (local calendar). */
export function isDobInFuture(dob: Date | string, now: Date = new Date()): boolean {
  return startOfLocalDay(parseDateOnly(dob)) > startOfLocalDay(now);
}

/** Earliest accepted DOB: the day after the 16th birthday would fall on today. */
export function minAllowedDob(now: Date = new Date()): Date {
  return addCalendar(startOfLocalDay(now), { years: -MAX_AGE_YEARS, days: 1 });
}

// ─── Onboarding path ─────────────────────────────────────────────────────────

/** Onboarding question path: A under 3, B 3–8, C 9–15. */
export type OnboardingPath = 'A' | 'B' | 'C';

/** A (<3 years), B (3–8 years), C (9–15 years); null when the DOB is in the
 *  future, invalid, or on/after the 16th birthday. */
export function getOnboardingPath(dob: Date | string, now: Date = new Date()): OnboardingPath | null {
  const age = getAgeParts(dob, now);
  if (!age || age.years >= MAX_AGE_YEARS) return null;
  if (age.years < 3) return 'A';
  if (age.years < 9) return 'B';
  return 'C';
}

/** Parent-facing name of each onboarding path. Ranges match getBracket's labels. */
export const ONBOARDING_PATH_LABELS: Record<OnboardingPath, string> = {
  A: 'Infant care (0–2 years)',
  B: 'Early years (3–8 years)',
  C: 'Pre-teen and teen (9–15 years)',
};

// ─── Age label ───────────────────────────────────────────────────────────────

/**
 * The one age label used everywhere (onboarding, confirm, home, profile,
 * check-in):
 *   under 1 week   → "Newborn"
 *   under 1 month  → "2 weeks"
 *   under 1 year   → "4 months"
 *   whole years    → "9 years"
 *   otherwise      → "2y 3m"
 * `{ old: true }` appends " old" ("4 months old"), except for "Newborn".
 * Returns '' for an invalid or future DOB.
 */
export function formatAgeLabel(
  dob: Date | string,
  { old = false, now = new Date() }: { old?: boolean; now?: Date } = {},
): string {
  const age = getAgeParts(dob, now);
  if (!age) return '';
  const suffix = old ? ' old' : '';

  if (age.totalMonths < 1) {
    const weeks = Math.floor(age.totalDays / 7);
    if (weeks < 1) return 'Newborn';
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}${suffix}`;
  }
  if (age.years < 1) return `${age.months} ${age.months === 1 ? 'month' : 'months'}${suffix}`;
  if (age.months === 0) return `${age.years} ${age.years === 1 ? 'year' : 'years'}${suffix}`;
  return `${age.years}y ${age.months}m${suffix}`;
}
