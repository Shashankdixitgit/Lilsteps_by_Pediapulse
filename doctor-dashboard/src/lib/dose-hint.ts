/**
 * Weight-based dose check for the prescription form.
 *
 * Paediatric prescribing guidance (e.g. bpac NZ, ACSQHC 2024) asks for the
 * child's weight and the mg/kg basis next to the absolute dose, because
 * dosing errors (often tenfold) are the most common prescribing error in
 * children. This only works the mg/kg back out of what the doctor typed so
 * they can sanity-check it; it never suggests a dose.
 *
 *   dose "250 mg"                       → 250 mg
 *   dose "5 ml", strength "250 mg/5 ml" → 250 mg
 *   dose "5 ml", strength "100 mg/ml"   → 500 mg
 *
 * A wrong hint is worse than none, so whenever the text is not plainly one
 * of those shapes it returns null:
 *   - the dose has no number, or more than one (ranges, "5 ml (250 mg)");
 *   - a number is written ".5" (leading point) or with a decimal comma "2,5";
 *   - the dose is already per kg ("15 mg/kg");
 *   - the strength is a combination ("+", or more than one mg value), e.g.
 *     "Amoxicillin 400 mg + Clavulanate 57 mg/5 ml";
 *   - the strength has more than one concentration or uses a decimal comma.
 */

/** Every number in the text. A number touching a '.' or ',' (".5", "2,5", "1.2.3") makes the text unreadable → null. */
function numbers(s: string): number[] | null {
  if (/\d\s*,\s*\d/.test(s)) return null; // decimal comma (or a list): unsure
  if (/(^|[^\d])\.\d/.test(s)) return null; // ".5" without a leading zero: unsure
  if (/\d\.(?!\d)/.test(s)) return null; // "5." trailing point: unsure
  const out: number[] = [];
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) out.push(Number.parseFloat(m[0]));
  if (out.some((n) => !Number.isFinite(n))) return null;
  return out;
}

/** mg per ml from a liquid strength ("250 mg/5 ml", "100 mg/ml"), or null. */
function mgPerMl(strength: string): number | null {
  const s = strength.trim();
  if (!s) return null;
  if (s.includes('+')) return null; // combination product
  const nums = numbers(s);
  if (nums === null) return null;
  const mgCount = (s.match(/\d(?:\.\d+)?\s*mg\b/gi) ?? []).length;
  if (mgCount !== 1) return null;
  const conc = s.match(/(\d+(?:\.\d+)?)\s*mg\s*\/\s*(\d+(?:\.\d+)?)?\s*ml\b/i);
  if (!conc) return null;
  // Exactly the numbers of that one concentration, nothing else ("Syrup 250 mg/5 ml").
  if (nums.length !== (conc[2] ? 2 : 1)) return null;
  const per = conc[2] ? Number.parseFloat(conc[2]) : 1;
  if (per <= 0) return null;
  return Number.parseFloat(conc[1]) / per;
}

/** The dose in mg, or null when it cannot be read with confidence. */
export function doseMg(dose: string, strength: string): number | null {
  const d = dose.trim();
  if (!d) return null;
  if (/\/\s*kg\b|\bkg\b/i.test(d)) return null; // already per kg
  if (d.includes('+')) return null;
  // A combination strength makes any mg reading ambiguous.
  if (strength.includes('+') || (strength.match(/\d(?:\.\d+)?\s*mg\b/gi) ?? []).length > 1) return null;
  const nums = numbers(d);
  if (nums === null || nums.length !== 1) return null;
  const value = nums[0];
  if (value <= 0) return null;

  if (/^\d+(?:\.\d+)?\s*mg\b/i.test(d.replace(/^[^\d]*/, ''))) return value;
  if (/^\d+(?:\.\d+)?\s*ml\b/i.test(d.replace(/^[^\d]*/, ''))) {
    const perMl = mgPerMl(strength);
    return perMl == null ? null : value * perMl;
  }
  return null;
}

/** "≈ 15 mg/kg per dose at 16.4 kg", or null when it cannot be worked out. */
export function doseHint(dose: string, strength: string, weightKg: number | null): string | null {
  if (!weightKg || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  const mg = doseMg(dose, strength);
  if (mg == null || !Number.isFinite(mg) || mg <= 0) return null;
  const perKg = mg / weightKg;
  const shown = perKg >= 10 ? Math.round(perKg) : Math.round(perKg * 10) / 10;
  return `≈ ${shown} mg/kg per dose at ${weightKg} kg`;
}
