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
