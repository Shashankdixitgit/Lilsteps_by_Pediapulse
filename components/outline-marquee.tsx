import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Text as SvgText } from 'react-native-svg';

import { AppColors, FontFamily } from '@/constants/theme';

interface OutlineMarqueeProps {
  /** Words shown in the strip, joined with a bullet. */
  items: string[];
  /** Pixel width of one copy of the phrase. Estimated from the text if omitted. */
  segmentWidth?: number;
  height?: number;
  fontSize?: number;
  /** Seconds for one full loop. */
  duration?: number;
}

/**
 * Stroked (outline-only) mint text scrolling sideways — the healthnivaran.in
 * marquee motif. Purely decorative: hidden from screen readers, and static
 * when the OS "reduce motion" setting is on.
 */
export function OutlineMarquee({
  items,
  segmentWidth: segmentWidthProp,
  height = 40,
  fontSize = 30,
  duration = 18,
}: OutlineMarqueeProps) {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const phrase = `${items.join(' • ')} • `.toUpperCase();
  // Inter Bold caps + bullets measure ~0.6em per character; 0.62 leaves a
  // small breathing gap. Both copies are laid out at exactly this width.
  const segmentWidth = segmentWidthProp ?? Math.ceil(phrase.length * fontSize * 0.62);

  useEffect(() => {
    if (reduceMotion) return;
    x.set(withRepeat(
      withTiming(-segmentWidth, { duration: duration * 1000, easing: Easing.linear }),
      -1,
      false,
    ));
  }, [reduceMotion, segmentWidth, duration, x]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      style={[styles.clip, { height }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      pointerEvents="none"
    >
      <Animated.View style={[styles.row, { width: segmentWidth * 2 }, animatedStyle]}>
        {[0, 1].map((i) => (
          <Svg key={i} width={segmentWidth} height={height} style={styles.segment}>
            <SvgText
              x={0}
              y={height * 0.78}
              fontSize={fontSize}
              fontFamily={FontFamily.bold}
              fontWeight="700"
              fill="none"
              stroke={AppColors.mint}
              strokeWidth={1}
              letterSpacing={0.5}
            >
              {phrase}
            </SvgText>
          </Svg>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    width: '100%',
  },
  row: {
    flexDirection: 'row',
  },
  segment: {
    flexShrink: 0,
  },
});
