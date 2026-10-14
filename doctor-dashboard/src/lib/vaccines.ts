import { todayIst } from './format';

/**
 * Vaccines given every year (the flu shot). Never overdue: a missed year is
 * just "this year's dose". Same list as ANNUAL_VACCINE_NAMES in the parent
 * app (constants/vaccineQuestions.ts); the database moves stored 'overdue'
 * rows for them to 'upcoming' (trigger annual_vaccine_never_overdue, 0040).
 */
export const ANNUAL_VACCINE_NAMES: ReadonlySet<string> = new Set(['Influenza']);

export function isAnnualVaccine(name: string): boolean {
  return ANNUAL_VACCINE_NAMES.has(name);
}

export type VaccineBucket = 'done' | 'overdue' | 'upcoming' | 'yearly' | 'other';

/**
 * Where a dose belongs on the doctor's list. 'done' and 'unknown' are read as
 * stored. Other stored statuses are a snapshot from when the schedule was
 * made, so the date decides (same rule as the parent app's statusForDate and
 * public.vaccine_status_for): past = overdue, otherwise upcoming. An annual
 * vaccine that isn't given is 'yearly', never overdue.
 */
export function vaccineBucket(
  v: { vaccine_name: string; status: string; scheduled_date: string },
  today: string = todayIst(),
): VaccineBucket {
  if (v.status === 'done') return 'done';
  if (isAnnualVaccine(v.vaccine_name)) return 'yearly';
  if (!['overdue', 'upcoming', 'due_soon'].includes(v.status)) return 'other';
  return v.scheduled_date < today ? 'overdue' : 'upcoming';
}

