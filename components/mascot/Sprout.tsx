import { useIsFocused } from 'expo-router';
import { Image } from 'expo-image';
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

import { Motion } from '@/constants/theme';
import { useMotion } from '@/components/ui/useMotion';

/**
 * Lil: LilSteps' mascot, the boy doctor-superhero from the clinic website
 * and the store screenshots. Replaced the old seedling (still exported as
 * `Sprout` / `SproutArt` so call sites did not change).
 *
 * Artwork: cut-outs from the Lil character guide (assets/images/lil). Never
 * mirrored or recoloured: the cape logo must stay readable. Small sizes
 * (<= 44 px) show a head-and-shoulders crop in a lavender circle, because a
 * full-body figure is unreadable there.
 *
 * Purely decorative (hidden from screen readers). Never shown on danger /
 * red-flag content, prescriptions, record detail, doctor chat or video.
 */

export type SproutMood = 'happy' | 'cheer' | 'think' | 'sleepy' | 'care' | 'wave';

const POSES = {
  welcome: require('@/assets/images/lil/lil-welcome.png'),
  cheer: require('@/assets/images/lil/lil-cheer.png'),
  idea: require('@/assets/images/lil/lil-idea.png'),
  crossed: require('@/assets/images/lil/lil-crossed.png'),
  thumbs: require('@/assets/images/lil/lil-thumbs.png'),
} as const;
const AVATAR = require('@/assets/images/lil/lil-avatar.png');

/** Mood → pose from the character guide's pose library. */
const POSE_FOR_MOOD: Record<SproutMood, keyof typeof POSES> = {
  happy: 'welcome',
  wave: 'welcome',
  cheer: 'cheer',
  think: 'idea',
  care: 'thumbs',
  sleepy: 'crossed',
};

const SMALL = 44;

interface SproutProps {
  mood?: SproutMood;
  /** Box size in px (24-160). Lil stands inside it, feet on the bottom edge. */
  size?: number;
  /** Idle bob (translateY +-3, 2.4 s). Max one per screen; paused on blur. */
  animated?: boolean;
  /** One-shot spring pop on mount (no repeat). */
  entrance?: boolean;
  style?: StyleProp<ViewStyle>;
}

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
  if (size <= SMALL) {
    return (
      <Image
        source={AVATAR}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        accessible={false}
      />
    );
  }
  return (
    <Image
      source={POSES[POSE_FOR_MOOD[mood]]}
      style={{ width: size, height: size }}
      contentFit="contain"
      contentPosition="bottom"
      accessible={false}
    />
  );
});

/** Plain-English alias: new code should say `Lil`. */
export const Lil = Sprout;
export type LilMood = SproutMood;
