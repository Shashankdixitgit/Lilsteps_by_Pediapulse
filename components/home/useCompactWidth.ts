import { useWindowDimensions } from 'react-native';

/**
 * Below this window width (a small phone at 200% zoom / largest text) the
 * home cards drop their decorative icon well so the text keeps a readable
 * column, and the header child switcher shows the avatar only (its name
 * stays in the accessible name). Same breakpoint as the tab bar.
 */
export const COMPACT_WIDTH = 300;

export function useCompactWidth(): boolean {
  return useWindowDimensions().width < COMPACT_WIDTH;
}
