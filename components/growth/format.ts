/**
 * Growth number formatting shared by Home, the Growth tab, history rows, the
 * chart and set-up. Weights show one decimal ("3.5", "12.5"). Under 10 kg a
 * 50 g change matters (a newborn gaining 3.45 -> 3.50 kg), so a second
 * decimal is kept there only when it carries something ("3.45", not
 * "3.50"); heavier weights and lengths keep 1 (R3-12).
 */
export function formatWeightValue(kg: number): string {
  if (Math.abs(kg) >= 10) return kg.toFixed(1);
  const two = kg.toFixed(2);
  return two.endsWith('0') ? kg.toFixed(1) : two;
}

/** "3.45" / "12.5" / "—" for a weight that may be missing. */
export function formatWeight(kg: number | null | undefined): string {
  return kg == null ? '—' : formatWeightValue(Number(kg));
}

/** "62.5" / "—" for a length or height in cm. */
export function formatHeight(cm: number | null | undefined): string {
  return cm == null ? '—' : Number(cm).toFixed(1);
}
