/**
 * Order of the onboarding screens on each path, used by OnboardingShell for
 * "Step X of Y" and the progress bar. confirm is the last step on every
 * path and does not use the shell, so the bar never reaches 100% on a
 * question screen.
 */
import type { OnboardingPath } from '@/lib/age';

export type OnboardingScreen =
  | 'parent-details'
  | 'add-child'
  | 'child-basics'
  | 'physical'
  | 'allergies'
  | 'conditions'
  | 'a-birth-history'
  | 'a-feeding'
  | 'a-milestones'
  | 'a-vaccination'
  | 'a-sleep'
  | 'b-development'
  | 'b-diet-activity'
  | 'b-vaccination'
  | 'b-sleep-dental'
  | 'c-academic'
  | 'c-diet'
  | 'c-puberty'
  | 'c-mental-health'
  | 'c-vaccination'
  | 'c-sleep'
  | 'confirm';

const COMMON_STEPS: OnboardingScreen[] = [
  'parent-details',
  'add-child',
  'child-basics',
  'physical',
  'allergies',
  'conditions',
];

export const ONBOARDING_STEPS: Record<OnboardingPath, OnboardingScreen[]> = {
  A: [...COMMON_STEPS, 'a-birth-history', 'a-feeding', 'a-milestones', 'a-vaccination', 'a-sleep', 'confirm'],
  B: [...COMMON_STEPS, 'b-development', 'b-diet-activity', 'b-vaccination', 'b-sleep-dental', 'confirm'],
  C: [...COMMON_STEPS, 'c-academic', 'c-diet', 'c-puberty', 'c-mental-health', 'c-vaccination', 'c-sleep', 'confirm'],
};

/** First path-specific screen after "conditions". */
export const FIRST_PATH_SCREEN: Record<OnboardingPath, OnboardingScreen> = {
  A: 'a-birth-history',
  B: 'b-development',
  C: 'c-academic',
};

export interface OnboardingStep {
  /** 1-based position of the screen. */
  step: number;
  /** Total steps on the path, including confirm; null while the path is not
   *  known yet (before the date of birth is entered). */
  total: number | null;
}

/**
 * Position of a screen. Before the path is known, the common screens report
 * `total: null` (show "Step X" only). Returns null for a screen that is not
 * on the given path.
 */
export function getOnboardingStep(screen: OnboardingScreen, path: OnboardingPath | null): OnboardingStep | null {
  if (path) {
    const steps = ONBOARDING_STEPS[path];
    const idx = steps.indexOf(screen);
    return idx === -1 ? null : { step: idx + 1, total: steps.length };
  }
  const idx = COMMON_STEPS.indexOf(screen);
  return idx === -1 ? null : { step: idx + 1, total: null };
}
