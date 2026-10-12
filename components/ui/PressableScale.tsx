import { ReactNode } from 'react';
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

import { haptic } from './useMotion';

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
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const p = pressed.get();
    return {
      transform: [{ scale: interpolate(p, [0, 1], [1, scaleTo]) }],
      ...(bg && bgPressed ? { backgroundColor: interpolateColor(p, [0, 1], [bg, bgPressed]) } : null),
    };
  });

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      hitSlop={hitSlop}
      onPressIn={(e) => {
        pressed.set(withTiming(1, { duration: Motion.pressIn }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.set(withSpring(0, Motion.springPress));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (hapticOnPress) haptic('light');
        onPress?.(e);
      }}
      style={[bg ? { backgroundColor: bg } : null, style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
