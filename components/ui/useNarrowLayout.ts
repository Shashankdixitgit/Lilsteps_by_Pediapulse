import { useWindowDimensions } from 'react-native';

import { isNarrowLayout } from './narrowLayout';

/** True on a small phone or with larger text (see narrowLayout.ts). */
export function useNarrowLayout(): boolean {
  const { width, fontScale } = useWindowDimensions();
  return isNarrowLayout(width, fontScale);
}
