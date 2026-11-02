/**
 * Small phone, larger text, or both: the layout to use when a row would
 * otherwise break words in half or cut text with "…" (mobile review
 * must-fix 4-6, should-fix 8-11). Same rule as the Profile hero: text at
 * 130% or more, or under 340 points of width once the text scale is taken
 * out (iPhone SE at 130%, a 360 Android at 110%).
 *
 * Pure (no React Native import) so Deno can test it; useNarrowLayout reads
 * the window.
 */
export const NARROW_WIDTH = 340;
export const LARGE_TEXT_SCALE = 1.3;

export function isNarrowLayout(width: number, fontScale: number): boolean {
  if (!width) return false;
  const scale = Math.max(fontScale || 1, 1);
  return scale >= LARGE_TEXT_SCALE || width / scale < NARROW_WIDTH;
}
