import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Geometry of the floating tab bar (app/(tabs)/_layout.tsx), shared so tab
 * screens reserve exactly the space it covers (R2-17): content scrolls clear
 * of the bar and of the AI check-in button, and a focused item is never
 * hidden underneath it.
 */

/** The round AI check-in button (inner circle). */
export const AI_BTN_SIZE = 52;
/** Its white ring (padding around the circle). */
export const AI_BTN_RING = 4;
/** Height of the bar row itself (icon + label). */
export const TAB_BAR_HEIGHT = 66;
/** Bar side padding (wrapper 12 + inner 4, each side) plus the 1px border. */
export const BAR_CHROME_W = 2 * 12 + 2 * 4 + 2;
/** Narrowest tab that still shows its text label. */
export const MIN_LABELLED_TAB_W = 36;
/** Gap kept free for the AI button between the left and right tabs. */
export const AI_SPACER_W = AI_BTN_SIZE + 20;

/**
 * Narrow window (small phone at 200% zoom): the AI button moves above the bar
 * at the right, so the four tabs share the full width and keep their labels.
 */
export function isCompactTabBar(windowWidth: number): boolean {
  return (windowWidth - BAR_CHROME_W - AI_SPACER_W) / 4 < 44;
}

/** Largest text scale for tab labels (12 → ~16); the bar grows with it. */
export const TAB_LABEL_MAX_SCALE = 1.35;
/** Tab label line height at 100% text. */
const TAB_LABEL_LINE = 16;

/** Extra space between the last item and the top of the bar / button. */
const BREATHING_ROOM = 24;

/**
 * Vertical space the bar + AI button cover at the bottom of the screen.
 * Includes the whole AI button (R3-19): in the normal layout it sits across
 * the bar's top edge, but the last card must clear the full button, not just
 * the half above the bar, or its last line ends up under the button. The bar
 * grows with the (capped) label text size, and the breathing room grows
 * with the text size so large text still gets a visible gap.
 */
export function tabBarSpace(windowWidth: number, insetBottom: number, fontScale = 1): number {
  const scale = Math.max(1, fontScale);
  const bottomPadding = Math.max(insetBottom, 12);
  const button = AI_BTN_SIZE + 2 * AI_BTN_RING;
  const barHeight = TAB_BAR_HEIGHT + TAB_LABEL_LINE * (Math.min(scale, TAB_LABEL_MAX_SCALE) - 1);
  // Normal: the button's centre is on the bar's top edge, so `button / 2`
  // sits above the bar; reserve the full button height above it so content
  // on either side of the button stays readable. Compact: the whole button
  // sits above the bar, plus an 8px gap and its 8px offset.
  const overhang = isCompactTabBar(windowWidth) ? button + 16 : button;
  return Math.ceil(bottomPadding + barHeight + overhang + BREATHING_ROOM * scale);
}

/**
 * Height the bar covers at the screen's right edge, for a screen's own
 * floating button (Records "Add a record"): just the bar normally, the bar
 * plus the AI button in the compact layout (where the AI button moves to the
 * right, above the bar). Place a right-side FAB this far up plus a gap.
 */
export function tabBarRightEdgeCover(windowWidth: number, insetBottom: number, fontScale = 1): number {
  const scale = Math.max(1, fontScale);
  const bottomPadding = Math.max(insetBottom, 12);
  const barHeight = TAB_BAR_HEIGHT + TAB_LABEL_LINE * (Math.min(scale, TAB_LABEL_MAX_SCALE) - 1);
  const button = AI_BTN_SIZE + 2 * AI_BTN_RING;
  return Math.ceil(bottomPadding + barHeight + (isCompactTabBar(windowWidth) ? button + 16 : 0));
}

export function useTabBarSpace(): number {
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return tabBarSpace(width, insets.bottom, fontScale);
}
