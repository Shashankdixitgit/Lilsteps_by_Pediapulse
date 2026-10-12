import { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppColors, Motion } from '@/constants/theme';

import { useMotion } from './useMotion';

interface AnimatedProgressProps {
  /** 0..1 */
  value: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  /** Sunshine dot riding at the end of the fill (with a ring for 3:1 contrast). */
  thumb?: boolean;
  thumbRing?: string;
  accessibilityLabel?: string;
  /** Start value for the mount animation (default 0). */
  animateFrom?: number;
}

/**
 * Progress bar that animates 0 -> value on mount. Transform-only: a full-width
 * fill inside an overflow-hidden track, slid in with translateX, so the
 * rounded end cap stays round (scaleX would squash it). Judge decision.
 */
export function AnimatedProgress({
  value,
  height = 8,
  trackColor = AppColors.surfaceContainerHigh,
  fillColor = AppColors.secondary,
  thumb = false,
  thumbRing = AppColors.primary,
  accessibilityLabel,
  animateFrom = 0,
}: AnimatedProgressProps) {
  const { reduceMotion } = useMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(reduceMotion ? value : animateFrom);
  const clamped = Math.max(0, Math.min(1, value));

  useEffect(() => {
    if (reduceMotion) progress.set(clamped);
    else progress.set(withTiming(clamped, { duration: Motion.progress, easing: Easing.out(Easing.cubic) }));
  }, [clamped, reduceMotion, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -width + width * progress.get() }],
  }));
  const thumbSize = height + 8;
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, width * progress.get() - thumbSize / 2 - 2) }],
  }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ height: thumb ? thumbSize : height, justifyContent: 'center' }}
    >
      <View onLayout={onLayout} style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }]}>
        <Animated.View
          style={[styles.fill, { borderRadius: height / 2, backgroundColor: fillColor }, fillStyle]}
        />
      </View>
      {thumb && width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            { width: thumbSize, height: thumbSize, borderRadius: thumbSize / 2, borderColor: thumbRing },
            thumbStyle,
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    backgroundColor: AppColors.sunshine,
    borderWidth: 2,
  },
});

