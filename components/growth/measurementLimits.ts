/**
 * Weight / height checks shared by the growth log. Same limits, ranges and
 * messages as onboarding's physical step (app/(onboarding)/physical.tsx), so
 * a parent sees the same "Please check" wording in both places.
 */
import { formatAgeLabel, getAgeParts } from '@/lib/age';

/** Values outside these can't be a real child's measurement: saving is blocked. */
export const WEIGHT_LIMITS = { min: 0.3, max: 200 }; // kg
export const HEIGHT_LIMITS = { min: 20, max: 220 }; // cm

/**
 * Wide, plausible ranges by age (in completed months), roughly beyond the
 * 1st–99th percentile of the WHO / IAP charts. A value outside the range for
 * the child's age is NOT blocked; the parent sees a gentle "Please check".
 */
const PLAUSIBLE_BY_AGE: { underMonths: number; weight: [number, number]; height: [number, number] }[] = [
  { underMonths: 1, weight: [1.5, 6], height: [40, 62] },
  { underMonths: 6, weight: [2.5, 11], height: [45, 75] },
  { underMonths: 12, weight: [5, 14], height: [58, 85] },
  { underMonths: 24, weight: [6.5, 18], height: [68, 100] },
  { underMonths: 36, weight: [8, 21], height: [78, 108] },
  { underMonths: 60, weight: [9.5, 28], height: [85, 125] },
  { underMonths: 108, weight: [12, 50], height: [100, 150] },
  { underMonths: 144, weight: [17, 80], height: [115, 175] },
  { underMonths: 192, weight: [22, 110], height: [125, 195] },
];

/** Typical value per age band, used only as a placeholder ("e.g. 4.2"). */
const EXAMPLE_BY_AGE: { underMonths: number; weight: string; height: string }[] = [
  { underMonths: 1, weight: '3.4', height: '50' },
  { underMonths: 6, weight: '6.2', height: '62' },
  { underMonths: 12, weight: '8.5', height: '71' },
  { underMonths: 24, weight: '10.5', height: '82' },
  { underMonths: 36, weight: '12.5', height: '91' },
  { underMonths: 60, weight: '15', height: '102' },
  { underMonths: 108, weight: '22', height: '122' },
  { underMonths: 144, weight: '32', height: '140' },
  { underMonths: 192, weight: '45', height: '158' },
];

/** Parses "12.5" or "12,5"; null for empty, NaN for text that isn't a number. */
export function parseMeasure(value: string): number | null {
  const v = value.trim().replace(',', '.');
  if (!v) return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(v) ? parseFloat(v) : NaN;
}

export type MeasureCheck = {
  error?: string;
  warning?: string;
  /** A likely intended value ("Did you mean 3.4 kg?"), when there is one. */
  suggestion?: number | null;
};

/** Age of the child on the measurement day ('YYYY-MM-DD'), for the checks. */
function ageOn(dob: string | Date | null | undefined, onDate: Date) {
  return dob ? getAgeParts(dob, onDate) : null;
}

export function ageText(dob: string | Date | null | undefined, onDate: Date = new Date()): string {
  if (!dob || !ageOn(dob, onDate)) return 'this age';
  const label = formatAgeLabel(dob, { now: onDate });
  return label === 'Newborn' ? 'a newborn' : label ? `a child aged ${label}` : 'this age';
}

/**
 * A likely slip when a value is out of range: grams typed as kg (3400 → 3.4),
 * a missed decimal point (34 → 3.4, 505 → 50.5) or metres typed as cm
 * (1.2 → 120). Returns the one candidate that fits the expected range, else
 * null (never guesses between two).
 */
export function likelyMeant(value: number, unit: 'kg' | 'cm', range: [number, number] | null): number | null {
  const limits = unit === 'kg' ? WEIGHT_LIMITS : HEIGHT_LIMITS;
  const [lo, hi] = range ?? [limits.min, limits.max];
  const factors = unit === 'kg' ? [1 / 1000, 1 / 10] : [1 / 10, 100];
  // kg to 2 decimals so grams keep their precision (3456 g → 3.46, not 3.5);
  // cm to 1 decimal (R3-21).
  const scale = unit === 'kg' ? 100 : 10;
  const fits = factors
    .map((f) => Math.round(value * f * scale) / scale)
    .filter((v) => v !== value && v >= lo && v <= hi);
  return fits.length === 1 ? fits[0] : null;
}

/** The expected range for the child's age on that day, or null without a DOB. */
export function plausibleRange(
  unit: 'kg' | 'cm',
  dob: string | Date | null | undefined,
  onDate: Date = new Date(),
): [number, number] | null {
  const age = dob ? getAgeParts(dob, onDate) : null;
  const band = age ? PLAUSIBLE_BY_AGE.find((r) => age.totalMonths < r.underMonths) : undefined;
  return band ? (unit === 'kg' ? band.weight : band.height) : null;
}

export function checkMeasure(
  raw: string,
  unit: 'kg' | 'cm',
  dob: string | Date | null | undefined,
  onDate: Date = new Date(),
  { action = 'save' }: { action?: 'save' | 'continue' } = {},
): MeasureCheck {
  const value = parseMeasure(raw);
  if (value === null) return {};
  if (Number.isNaN(value)) return { error: 'Enter a number, e.g. 12.5' };
  const plausible = plausibleRange(unit, dob, onDate);
  const limits = unit === 'kg' ? WEIGHT_LIMITS : HEIGHT_LIMITS;
  const outOfLimits = value < limits.min || value > limits.max;
  const unusual = !!plausible && (value < plausible[0] || value > plausible[1]);
  const meant = outOfLimits || unusual ? likelyMeant(value, unit, plausible) : null;
  const hint = meant != null ? ` Did you mean ${meant} ${unit}?` : '';
  if (outOfLimits) {
    return { error: `${value} ${unit} doesn't look right.${hint || ' Please check the number.'}`, suggestion: meant };
  }
  if (unusual) {
    return {
      warning: `Please check: ${value} ${unit} is unusual for ${ageText(dob, onDate)}.${hint} If it's right, you can ${action === 'save' ? 'save it' : 'continue'}.`,
      suggestion: meant,
    };
  }
  return {};
}

/** Age-appropriate "e.g." placeholders for the weight and height fields. */
export function measurePlaceholders(dob: string | Date | null | undefined): { weight: string; height: string } {
  const age = ageOn(dob, new Date());
  const band = age ? EXAMPLE_BY_AGE.find((r) => age.totalMonths < r.underMonths) : undefined;
  return { weight: `e.g. ${band?.weight ?? '12.5'}`, height: `e.g. ${band?.height ?? '85'}` };
}
