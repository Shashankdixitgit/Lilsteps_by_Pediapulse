import { ReactNode, useState } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

import { haptic, useMotion } from './useMotion';


interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Background colour at rest / pressed. When both are set the bg animates on the UI thread. */
  bg?: string;
  bgPressed?: string;
  /** Scale when pressed (default 0.97). */
  scaleTo?: number;
  /** Light impact haptic on press (CTAs only). */
  hapticOnPress?: boolean;
  /**
   * Solid offset shadow in px (HitRate-style CTA). At rest the control sits on
   * a navy copy of itself, `n` px down and to the left; pressing slides it onto
   * the shadow (translate, shadow → 0) instead of scaling.
   */
  offsetShadow?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The one press primitive: squishy scale (+ optional colour shift), transform
 * only, driven by a shared value so the animation runs on the UI thread.
 *
 * Judge decision: built on Pressable (not GestureDetector) so screen-reader
 * activation, disabled state and web all keep native semantics. The press
 * callbacks only flip a shared value; the animation itself runs on the UI thread.
 */
export function PressableScale({
  children,
  style,
  bg,
  bgPressed,
  scaleTo = Motion.pressScale,
  hapticOnPress,
  onPressIn,
  onPressOut,
  onPress,
  accessibilityRole = 'button',
  hitSlop = 6,
  offsetShadow,
  disabled,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const { reduceMotion } = useMotion();
  // The shadow string can't animate on the UI thread, so it flips with React
  // state; the slide itself is a UI-thread transform.
  const [down, setDown] = useState(false);
  const n = offsetShadow ?? 0;
  const slide = n > 0;

  const animatedStyle = useAnimatedStyle(() => {
    const p = pressed.get();
    return {
      transform: slide
        ? [{ translateX: interpolate(p, [0, 1], [0, -n]) }, { translateY: interpolate(p, [0, 1], [0, n]) }]
        : [{ scale: interpolate(p, [0, 1], [1, scaleTo]) }],
      ...(bg && bgPressed ? { backgroundColor: interpolateColor(p, [0, 1], [bg, bgPressed]) } : null),
    };
  });

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      hitSlop={hitSlop}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.set(reduceMotion && slide ? 1 : withTiming(1, { duration: Motion.pressIn }));
        if (slide) setDown(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.set(reduceMotion && slide ? 0 : withSpring(0, Motion.springPress));
        if (slide) setDown(false);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (hapticOnPress) haptic('light');
        onPress?.(e);
      }}
      style={[
        bg ? { backgroundColor: bg } : null,
        style,
        slide && !disabled ? { boxShadow: down ? 'none' : `-${n}px ${n}px 0px #0b1632` } : null,
        animatedStyle,
      ]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
