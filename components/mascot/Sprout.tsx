import { useIsFocused } from 'expo-router';
import { memo, useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Text as SvgText } from 'react-native-svg';

import { AppColors, ForestRamp, Motion } from '@/constants/theme';
import { useMotion } from '@/components/ui/useMotion';

export type SproutMood = 'happy' | 'cheer' | 'think' | 'sleepy' | 'care' | 'wave';

interface SproutProps {
  mood?: SproutMood;
  /** Rendered size in px (24-160). */
  size?: number;
  /** Idle bob (translateY +-3, 2.4 s). Max one per screen; paused on blur. */
  animated?: boolean;
  /** One-shot spring pop on mount (no repeat). */
  entrance?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Leaves stay visible on both the light canvas and the forest hero.
const LEAF_DARK = AppColors.success;
const LEAF_LIGHT = ForestRamp[3];

/**
 * Sprout: LilSteps' seedling mascot. A round mint body with two leaves.
 * Purely decorative (hidden from screen readers). Never shown on danger /
 * red-flag content, prescriptions, record detail, doctor chat or video.
 *
 * Motion only ever moves the wrapping Animated.View (transform), never SVG
 * props, so it costs nothing per frame on the JS thread.
 */
export const Sprout = memo(function Sprout({
  mood = 'happy',
  size = 64,
  animated = false,
  entrance = false,
  style,
}: SproutProps) {
  const { reduceMotion } = useMotion();
  const isFocused = useIsFocused();
  const bob = useSharedValue(0);
  const pop = useSharedValue(entrance && !reduceMotion ? 0.85 : 1);

  useEffect(() => {
    if (entrance && !reduceMotion) pop.set(withSpring(1, Motion.springBouncy));
  }, [entrance, reduceMotion, pop]);

  useEffect(() => {
    if (!animated || reduceMotion || !isFocused) {
      cancelAnimation(bob);
      bob.set(withTiming(0, { duration: 200 }));
      return;
    }
    bob.set(
      withRepeat(
        withSequence(
          withTiming(-3, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(bob);
  }, [animated, reduceMotion, isFocused, bob]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.get() }, { scale: pop.get() }],
  }));

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      pointerEvents="none"
      style={[{ width: size, height: size }, style, animatedStyle]}
    >
      <SproutArt mood={mood} size={size} />
    </Animated.View>
  );
});

/** Static artwork (exported for memoised reuse, e.g. chat avatars). */
export const SproutArt = memo(function SproutArt({ mood, size }: { mood: SproutMood; size: number }) {
  const leftLeafRot = mood === 'cheer' ? -18 : mood === 'sleepy' ? 12 : 0;
  const rightLeafRot = mood === 'cheer' || mood === 'wave' ? 16 : mood === 'sleepy' ? -10 : 0;

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {/* Stem + leaves */}
      <Path d="M32 27 L32 22" stroke={LEAF_DARK} strokeWidth={2.4} strokeLinecap="round" />
      <G rotation={leftLeafRot} origin="32, 23">
        <Path d="M32 23 C25 22 19 17 18 9 C26 9 31 14 32 23 Z" fill={LEAF_DARK} />
      </G>
      <G rotation={rightLeafRot} origin="32, 23">
        <Path d="M32 23 C35 14 41 8 48 7 C48 15 42 21 32 23 Z" fill={LEAF_LIGHT} />
      </G>

      {/* Body */}
      <Ellipse cx={32} cy={41} rx={19} ry={17} fill={AppColors.mint} />
      <Ellipse cx={32} cy={46} rx={11} ry={8} fill={AppColors.mintSurface} />

      {/* Cheeks */}
      <Circle cx={20} cy={44} r={3} fill={AppColors.peach} opacity={0.7} />
      <Circle cx={44} cy={44} r={3} fill={AppColors.peach} opacity={0.7} />

      <Face mood={mood} />
    </Svg>
  );
});

function Face({ mood }: { mood: SproutMood }) {
  const forest = AppColors.primary;

  if (mood === 'sleepy') {
    return (
      <G>
        <Path d="M22.5 38 Q25 40.5 27.5 38" stroke={forest} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Path d="M36.5 38 Q39 40.5 41.5 38" stroke={forest} strokeWidth={2} fill="none" strokeLinecap="round" />
        <Path d="M29.5 45 Q32 46.5 34.5 45" stroke={forest} strokeWidth={2} fill="none" strokeLinecap="round" />
        <SvgText x={47} y={22} fontSize={10} fontWeight="700" fill={AppColors.info}>
          z
        </SvgText>
        <SvgText x={53} y={15} fontSize={7} fontWeight="700" fill={AppColors.info}>
          z
        </SvgText>
      </G>
    );
  }

  const eyeY = mood === 'think' ? 36.5 : 38;
  const glintDy = mood === 'think' ? -1.2 : -0.9;

  return (
    <G>
      <Circle cx={25} cy={eyeY} r={2.6} fill={forest} />
      <Circle cx={39} cy={eyeY} r={2.6} fill={forest} />
      <Circle cx={25.9} cy={eyeY + glintDy} r={0.9} fill={AppColors.card} />
      <Circle cx={39.9} cy={eyeY + glintDy} r={0.9} fill={AppColors.card} />

      {mood === 'cheer' ? (
        <Path d="M26.5 44 Q32 51 37.5 44 Z" fill={forest} stroke={forest} strokeWidth={1.5} strokeLinejoin="round" />
      ) : mood === 'think' ? (
        <G>
          <Path d="M29.5 46 L34.5 45" stroke={forest} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={50} cy={30} r={1.6} fill={AppColors.secondary} />
          <Circle cx={54.5} cy={26} r={1.9} fill={AppColors.secondary} />
          <Circle cx={59} cy={21} r={2.2} fill={AppColors.secondary} />
        </G>
      ) : (
        <Path
          d={mood === 'care' ? 'M28.5 44.5 Q32 47 35.5 44.5' : 'M27.5 44 Q32 48.5 36.5 44'}
          stroke={forest}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      )}

      {mood === 'care' ? (
        <Path
          d="M52 14 C52 11.5 49 10.5 47.8 12.6 C46.6 10.5 43.6 11.5 43.6 14 C43.6 16.6 47.8 19 47.8 19 C47.8 19 52 16.6 52 14 Z"
          fill={AppColors.peach}
        />
      ) : null}
    </G>
  );
}
