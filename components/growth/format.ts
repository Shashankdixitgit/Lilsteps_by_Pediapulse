/**
 * Growth number formatting shared by the header, history rows and chart.
 * Under 10 kg a 50 g change matters (a newborn gaining 3.45 -> 3.50 kg), so
 * those weights keep 2 decimals; heavier weights and lengths keep 1 (R3-12).
 */
export function formatWeightValue(kg: number): string {
  return Math.abs(kg) < 10 ? kg.toFixed(2) : kg.toFixed(1);
}

/** "3.45" / "12.5" / "—" for a weight that may be missing. */
export function formatWeight(kg: number | null | undefined): string {
  return kg == null ? '—' : formatWeightValue(Number(kg));
}

/** "62.5" / "—" for a length or height in cm. */
export function formatHeight(cm: number | null | undefined): string {
  return cm == null ? '—' : Number(cm).toFixed(1);
}
