/**
 * Non-blocking allergy check for the prescription form.
 *
 * A medicine clashes with a recorded allergy when either
 *  - the allergy's name appears in the medicine name ("Amoxicillin" allergy,
 *    "Amoxicillin 250mg" prescribed), or
 *  - both fall in the same drug class below ("Penicillin" allergy,
 *    "Co-amoxiclav" prescribed).
 *
 * This is a prompt for the doctor, not a safety system: the class list is a
 * starting point and needs clinical review (Dr Atish) before it is relied on.
 */

export type AllergyInput = { name: string; severity?: string | null; type?: string | null };

export type AllergyClash = {
  allergy: string;
  severity: string | null;
  /** Human reason, e.g. "Amoxicillin is a penicillin". */
  reason: string;
  /** Lower-confidence cross-reactivity rather than a same-drug / same-class match. */
  crossReactivity?: boolean;
};

type DrugClass = { key: string; label: string; aliases: string[]; members: string[] };

const DRUG_CLASSES: DrugClass[] = [
  {
    key: 'penicillin',
    label: 'a penicillin',
    aliases: ['penicillin', 'penicillins', 'betalactam'],
    members: [
      'penicillin', 'amoxicillin', 'amoxycillin', 'ampicillin', 'coamoxiclav', 'amoxiclav',
      'augmentin', 'clavam', 'moxikind', 'novamox', 'cloxacillin', 'dicloxacillin',
      'flucloxacillin', 'piperacillin', 'benzathine', 'phenoxymethylpenicillin',
    ],
  },
  {
    key: 'cephalosporin',
    label: 'a cephalosporin',
    aliases: ['cephalosporin', 'cephalosporins'],
    members: [
      'cefixime', 'cefuroxime', 'cefpodoxime', 'ceftriaxone', 'cefalexin', 'cephalexin',
      'cefadroxil', 'cefdinir', 'cefprozil', 'cefotaxime', 'cefaclor', 'zifi', 'taxim',
    ],
  },
  {
    key: 'sulfa',
    label: 'a sulfa drug',
    aliases: ['sulfa', 'sulpha', 'sulfonamide', 'sulphonamide', 'sulfonamides', 'sulphonamides'],
    members: [
      'cotrimoxazole', 'sulfamethoxazole', 'sulphamethoxazole', 'septran', 'bactrim',
      'sulfadiazine', 'sulfasalazine', 'sulfa', 'sulpha',
    ],
  },
  {
    key: 'nsaid',
    label: 'an NSAID',
    aliases: ['nsaid', 'nsaids', 'antiinflammatory'],
    members: [
      'ibuprofen', 'brufen', 'ibugesic', 'combiflam', 'aspirin', 'diclofenac', 'naproxen',
      'mefenamic', 'meftal', 'ketorolac', 'nimesulide', 'aceclofenac',
    ],
  },
  {
    key: 'macrolide',
    label: 'a macrolide',
    aliases: ['macrolide', 'macrolides'],
    members: ['azithromycin', 'azithral', 'erythromycin', 'clarithromycin'],
  },
];

// Penicillin allergy → small cross-reactivity risk with cephalosporins.
const CROSS_REACTIVE: Record<string, string[]> = { penicillin: ['cephalosporin'] };

// Words in an allergy entry that say nothing about the substance.
const NOISE = new Set(['allergy', 'allergic', 'drug', 'drugs', 'medicine', 'reaction', 'mild', 'moderate', 'severe', 'rash', 'tablet', 'syrup']);

/** Lowercase, letters and digits only: "Co-Amoxiclav 228mg" → "coamoxiclav228mg". */
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function classesOfMedicine(medicine: string): DrugClass[] {
  const m = compact(medicine);
  return DRUG_CLASSES.filter((c) => c.members.some((x) => m.includes(x)));
}

function classesOfAllergy(allergy: string): DrugClass[] {
  const a = compact(allergy);
  const ws = words(allergy);
  return DRUG_CLASSES.filter(
    (c) => c.aliases.some((x) => ws.includes(x) || a.includes(x)) || c.members.some((x) => a.includes(x)),
  );
}

export function findAllergyClashes(medicine: string, allergies: AllergyInput[]): AllergyClash[] {
  const med = compact(medicine);
  if (med.length < 3) return [];
  const medClasses = classesOfMedicine(medicine);
  const display = medicine.trim();
  const out: AllergyClash[] = [];

  for (const a of allergies) {
    const name = a.name?.trim();
    if (!name) continue;
    const severity = a.severity ?? null;

    // 1. Same substance named in both.
    const tokens = words(name).filter((w) => w.length >= 4 && !NOISE.has(w));
    if (tokens.some((t) => med.includes(t))) {
      out.push({ allergy: name, severity, reason: `${display} matches this allergy by name` });
      continue;
    }

    // 2. Same drug class.
    const allergyClasses = classesOfAllergy(name);
    const shared = medClasses.find((c) => allergyClasses.some((ac) => ac.key === c.key));
    if (shared) {
      out.push({ allergy: name, severity, reason: `${display} is ${shared.label}` });
      continue;
    }

    // 3. Known cross-reactivity.
    const cross = medClasses.find((c) =>
      allergyClasses.some((ac) => (CROSS_REACTIVE[ac.key] ?? []).includes(c.key)),
    );
    if (cross) {
      out.push({
        allergy: name,
        severity,
        reason: `${display} is ${cross.label}, which can cross-react with this allergy`,
        crossReactivity: true,
      });
    }
  }
  return out;
}
