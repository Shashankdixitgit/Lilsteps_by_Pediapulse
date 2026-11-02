import { Platform } from 'react-native';

/**
 * Hosted web demo for the client (EXPO_PUBLIC_WEB_DEMO=1 at export time):
 * no SMS code, and every form starts filled with sample answers so the app
 * can be tried end to end in a browser. Web only: native builds never turn
 * it on, whatever the env says.
 */
export const WEB_DEMO = Platform.OS === 'web' && process.env.EXPO_PUBLIC_WEB_DEMO === '1';

/** A random 10-digit mobile number, so each tester gets their own account. */
export function randomDemoPhone(): string {
  let n = String(9 - Math.floor(Math.random() * 3));
  for (let i = 0; i < 9; i++) n += Math.floor(Math.random() * 10);
  return n;
}

/** The demo family that already has visits, prescriptions and records. */
export const DEMO_FAMILY_PHONE = process.env.EXPO_PUBLIC_WEB_DEMO_PHONE ?? '';

export const DEMO_PARENT_NAME = 'Priya Sharma';
export const DEMO_OTP = '123456';

/**
 * Sign-up refused because too many demo accounts were made this hour (the
 * demo-signup function's 429). Points to the sample family when there is one.
 */
export function demoLimitText(hasSampleFamily: boolean = !!DEMO_FAMILY_PHONE): string {
  const lead = 'Too many demo accounts were created in the last hour, often because a team is testing on one Wi-Fi.';
  return hasSampleFamily
    ? `${lead} Please try again later, or go back and tap "I already have an account" to open the sample family.`
    : `${lead} Please try again later.`;
}
