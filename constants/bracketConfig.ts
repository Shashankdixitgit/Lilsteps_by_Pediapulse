import { formatAgeLabel, getAgeParts } from '@/lib/age';

import { AppColors } from './theme';

export type AgeBracket =
  | 'NEWBORN'
  | 'EARLY_INFANT'
  | 'INFANT'
  | 'TODDLER_EARLY'
  | 'TODDLER'
  | 'PRESCHOOL'
  | 'SCHOOL_EARLY'
  | 'SCHOOL_MID'
  | 'ADOLESCENT';

export interface ActivityConfig {
  domain: string;
  name: string;
  duration: string;
  description: string;
  tint: string;
  accentColor: string;
}

export interface BracketConfig {
  greetingSubtext: (childName: string) => string;
  ctaTitle: string;
  ctaSubtitle: (childName: string) => string;
  activity: ActivityConfig;
}

export const BRACKET_CONFIG: Record<AgeBracket, BracketConfig> = {
  NEWBORN: {
    greetingSubtext: (name) => `${name} needs you close right now.`,
    ctaTitle: 'Start health check-in',
    ctaSubtitle: (name) => `Log ${name}'s feeds, sleep, and any concerns.`,
    activity: {
      domain: 'Gross Motor',
      name: 'Tummy time',
      duration: '2–3 min sessions',
      description: 'Place baby on tummy while supervised to strengthen neck muscles.',
      tint: AppColors.mintSurface,
      accentColor: AppColors.secondary,
    },
  },
  EARLY_INFANT: {
    greetingSubtext: (name) => `${name} is discovering the world.`,
    ctaTitle: 'Start health check-in',
    ctaSubtitle: (name) => `Track ${name}'s growth and milestones.`,
    activity: {
      domain: 'Sensory',
      name: 'Sensory play',
      duration: '5 min',
      description: 'Introduce textures — soft cloth, crinkle toy, your face.',
      tint: AppColors.skySurface,
      accentColor: AppColors.info,
    },
  },
  INFANT: {
    greetingSubtext: (name) => `Big discoveries every day with ${name}.`,
    ctaTitle: 'Start health check-in',
    ctaSubtitle: (name) => `Log ${name}'s milestones and symptoms today.`,
    activity: {
      domain: 'Cognitive',
      name: 'Peek-a-boo',
      duration: '5–10 min',
      description: 'Builds object permanence — a key developmental milestone.',
      tint: AppColors.peachSurface,
      accentColor: AppColors.peachText,
    },
  },
  TODDLER_EARLY: {
    greetingSubtext: (name) => `${name} · First steps, first words.`,
    ctaTitle: 'Start health check-in',
    ctaSubtitle: (name) => `Prepare ${name}'s summary for today.`,
    activity: {
      domain: 'Fine Motor',
      name: 'Stacking blocks',
      duration: '10 min',
      description: 'Stack 4–6 blocks high. Encourages hand-eye coordination.',
      tint: AppColors.sunshineSurface,
      accentColor: AppColors.sunshineText,
    },
  },
  TODDLER: {
    greetingSubtext: (name) => `${name} · Big feelings, big discoveries.`,
    ctaTitle: 'Start health check-in',
    ctaSubtitle: (name) => `AI will prepare ${name}'s summary for the doctor.`,
    activity: {
      domain: 'Cognitive',
      name: 'Shape sorting',
      duration: '10–15 min',
      description: 'Match shapes to holes. Name each shape as they go.',
      tint: AppColors.greenWash,
      accentColor: AppColors.primary,
    },
  },
  PRESCHOOL: {
    greetingSubtext: (name) => `${name} · Big kid energy, little person heart.`,
    ctaTitle: 'Start health check-in',
    ctaSubtitle: (name) => `AI will prepare ${name}'s summary for the doctor.`,
    activity: {
      domain: 'Cognitive',
      name: 'Counting & sorting',
      duration: '15 min',
      description: 'Sort objects by colour and count each group. Up to 10.',
      tint: AppColors.mintSurface,
      accentColor: AppColors.secondary,
    },
  },
  SCHOOL_EARLY: {
    greetingSubtext: (name) => `${name} · Growing curious every day.`,
    ctaTitle: 'Start health check-in',
    ctaSubtitle: (name) => `AI will prepare ${name}'s summary for the doctor.`,
    activity: {
      domain: 'Problem Solving',
      name: "2×2 Rubik's cube",
      duration: '15–20 min',
      description: 'Learn the first layer. Focus on pattern recognition.',
      tint: AppColors.skySurface,
      accentColor: AppColors.info,
    },
  },
  SCHOOL_MID: {
    greetingSubtext: (name) => `${name} · Building strong foundations.`,
    ctaTitle: 'Start health check-in',
    ctaSubtitle: (name) => `AI will prepare ${name}'s summary for the doctor.`,
    activity: {
      domain: 'Strategy',
      name: 'Chess openings',
      duration: '20 min',
      description: 'Practice 3 openings: Italian, London, and Ruy López.',
      tint: AppColors.sunshineSurface,
      accentColor: AppColors.sunshineText,
    },
  },
  ADOLESCENT: {
    greetingSubtext: (name) => `${name} · Growing stronger every day.`,
    ctaTitle: 'Start health check-in',
    ctaSubtitle: (name) => `AI will prepare ${name}'s summary for the doctor.`,
    activity: {
      domain: 'Problem Solving',
      name: "Rubik's cube — beat your time",
      duration: '20–30 min',
      description: 'Full 3×3 solve. Track your personal best.',
      tint: AppColors.greenWash,
      accentColor: AppColors.primary,
    },
  },
};

/**
 * Parent-facing name of each bracket. Ranges are in completed age and never
 * overlap; they nest inside the onboarding paths (lib/age.ts):
 *   path A (0–2 years)  = NEWBORN … TODDLER
 *   path B (3–8 years)  = PRESCHOOL, SCHOOL_EARLY
 *   path C (9–15 years) = SCHOOL_MID, ADOLESCENT
 */
export const BRACKET_LABELS: Record<AgeBracket, string> = {
  NEWBORN: 'Newborn (0–2 months)',
  EARLY_INFANT: 'Early infant (3–5 months)',
  INFANT: 'Infant (6–11 months)',
  TODDLER_EARLY: 'Young toddler (12–17 months)',
  TODDLER: 'Toddler (18 months–2 years)',
  PRESCHOOL: 'Preschool (3–4 years)',
  SCHOOL_EARLY: 'Early school years (5–8 years)',
  SCHOOL_MID: 'Pre-teen (9–11 years)',
  ADOLESCENT: 'Teen (12–15 years)',
};

/**
 * Derives the age bracket from a date of birth (Date or 'YYYY-MM-DD').
 * Recomputed fresh, never persisted. Uses calendar age (lib/age.ts), so the
 * cut-offs agree with the onboarding path on every birthday.
 */
export function getBracket(dob: Date | string, now: Date = new Date()): AgeBracket {
  const months = getAgeParts(dob, now)?.totalMonths ?? 0;
  if (months < 3) return 'NEWBORN';
  if (months < 6) return 'EARLY_INFANT';
  if (months < 12) return 'INFANT';
  if (months < 18) return 'TODDLER_EARLY';
  if (months < 36) return 'TODDLER';
  if (months < 60) return 'PRESCHOOL';
  if (months < 108) return 'SCHOOL_EARLY';
  if (months < 144) return 'SCHOOL_MID';
  return 'ADOLESCENT';
}

/** Age label, e.g. "4 months", "2y 3m", "9 years". Same as formatAgeLabel(). */
export function formatAge(dob: Date | string): string {
  return formatAgeLabel(dob);
}
