import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { AppColors, FontFamily, Motion, Shadow } from '@/constants/theme';

import { useMotion } from './useMotion';

type StickerTone = 'sunshine' | 'mint' | 'peach' | 'sky';

const TONES: Record<StickerTone, string> = {
  sunshine: AppColors.sunshine,
  mint: AppColors.mint,
  peach: AppColors.peach,
  sky: AppColors.sky,
};

interface StickerProps {
  tone?: StickerTone;
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  size?: number;
  /** Earned stickers are filled; unearned are a solid outline with a lock. */
  earned?: boolean;
  /** Pop in with a spring on mount. */
  pop?: boolean;
}

/**
 * Clay-style reward sticker. Rewards LOGGING only, never body size or
 * percentile (DESIGN.md ethics rule). Decorative: hidden from screen readers;
 * the label text beside it carries the meaning.
 */
export function Sticker({ tone = 'sunshine', icon, label, size = 44, earned = true, pop = false }: StickerProps) {
  const { reduceMotion } = useMotion();
  const scale = useSharedValue(pop && !reduceMotion ? 0.4 : 1);

  useEffect(() => {
    if (pop && !reduceMotion) scale.set(withSpring(1, Motion.springBouncy));
  }, [pop, reduceMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <View style={styles.wrap}>
      <Animated.View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[
          styles.disc,
          { width: size, height: size, borderRadius: size / 2 },
          earned
            ? { backgroundColor: TONES[tone], borderColor: AppColors.primary, boxShadow: Shadow.clay }
            : styles.unearned,
          animatedStyle,
        ]}
      >
        <Ionicons
          name={earned ? icon : 'lock-closed'}
          size={Math.round(size * 0.45)}
          color={earned ? AppColors.primary : AppColors.outlineVariant}
        />
      </Animated.View>
      {label ? (
        <Text style={[styles.label, !earned && styles.labelMuted]} numberOfLines={2}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 6,
    maxWidth: 84,
  },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  unearned: {
    backgroundColor: AppColors.card,
    borderColor: AppColors.borderStrong,
  },
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.onSurface,
    textAlign: 'center',
  },
  labelMuted: {
    color: AppColors.muted,
  },
});

