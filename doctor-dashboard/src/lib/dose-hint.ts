/**
 * Weight-based dose check for the prescription form.
 *
 * Paediatric prescribing guidance (e.g. bpac NZ, ACSQHC 2024) asks for the
 * child's weight and the mg/kg basis next to the absolute dose, because
 * dosing errors (often tenfold) are the most common prescribing error in
 * children. This only works the mg/kg back out of what the doctor typed so
 * they can sanity-check it; it never suggests a dose.
 *
 *   dose "250 mg"                      → 250 mg
 *   dose "5 ml", strength "250 mg/5 ml" → 250 mg
 */
function num(s: string): number {
  return Number.parseFloat(s);
}

export function doseMg(dose: string, strength: string): number | null {
  const mg = dose.match(/(\d+(?:\.\d+)?)\s*mg\b/i);
  if (mg) return num(mg[1]);
  const ml = dose.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  const conc = strength.match(/(\d+(?:\.\d+)?)\s*mg\s*\/\s*(\d+(?:\.\d+)?)?\s*ml\b/i);
  if (ml && conc) {
    const perMl = num(conc[1]) / (conc[2] ? num(conc[2]) : 1);
    return num(ml[1]) * perMl;
  }
  return null;
}

/** "≈ 15 mg/kg per dose at 16.4 kg", or null when it cannot be worked out. */
export function doseHint(dose: string, strength: string, weightKg: number | null): string | null {
  if (!weightKg || weightKg <= 0) return null;
  const mg = doseMg(dose, strength);
  if (mg == null || !Number.isFinite(mg) || mg <= 0) return null;
  const perKg = mg / weightKg;
  const shown = perKg >= 10 ? Math.round(perKg) : Math.round(perKg * 10) / 10;
  return `≈ ${shown} mg/kg per dose at ${weightKg} kg`;
}
