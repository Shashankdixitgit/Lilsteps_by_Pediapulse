import { Ionicons } from '@expo/vector-icons';
import { Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeOutDown, SlideInDown, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sprout } from '@/components/mascot/Sprout';
import { Sticker } from '@/components/ui/Sticker';
import { haptic, useMotion } from '@/components/ui/useMotion';
import { AppColors, FontFamily, Motion, Radius, Shadow } from '@/constants/theme';

import { Confetti } from './Confetti';

export interface CelebrateOptions {
  title: string;
  body?: string;
  /** Full burst (more pieces) vs a small one. */
  big?: boolean;
  /** Show the card (default true). False = confetti only. */
  card?: boolean;
}

export interface CelebrateHandle {
  fire: (opts: CelebrateOptions) => void;
}

interface CelebrateProps {
  ref?: Ref<CelebrateHandle>;
  /** Extra bottom offset (e.g. tab bar height) for the card. */
  bottomOffset?: number;
}

/**
 * One-shot celebration: confetti burst + a bottom card with Sprout.
 * - Confetti is skipped under reduced motion (the card still shows).
 * - Announces the title for screen readers (iOS announce + Android live region).
 * - Auto-dismisses after 4 s unless a screen reader is on.
 * Mount it OUTSIDE any loading early-return so it survives refetches.
 */
export function Celebrate({ ref, bottomOffset = 0 }: CelebrateProps) {
  const { reduceMotion } = useMotion();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const [burst, setBurst] = useState<{ seed: number; big: boolean } | null>(null);
  const [card, setCard] = useState<CelebrateOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useImperativeHandle(ref, () => ({
    fire: (opts) => {
      haptic('success');
      if (!reduceMotion) {
        setBurst({ seed: Date.now() % 1000, big: !!opts.big });
        progress.set(0);
        progress.set(withTiming(1, { duration: Motion.celebrate, easing: Easing.out(Easing.quad) }));
      }
      if (opts.card !== false) {
        setCard(opts);
        AccessibilityInfo.announceForAccessibility(opts.title);
        if (timer.current) clearTimeout(timer.current);
        AccessibilityInfo.isScreenReaderEnabled()
          .then((sr) => {
            if (!sr) timer.current = setTimeout(() => setCard(null), 4000);
          })
          .catch(() => {
            timer.current = setTimeout(() => setCard(null), 4000);
          });
      }
    },
  }));

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {burst ? <Confetti key={burst.seed} progress={progress} seed={burst.seed} count={burst.big ? 20 : 14} /> : null}
      {card ? (
        <Animated.View
          entering={reduceMotion ? undefined : SlideInDown.springify().damping(16)}
          exiting={reduceMotion ? undefined : FadeOutDown.duration(Motion.exit)}
          accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
          style={[styles.card, { bottom: insets.bottom + 16 + bottomOffset }]}
        >
          <Sprout mood="cheer" size={64} />
          <View style={styles.textCol}>
            <Text style={styles.title}>{card.title}</Text>
            {card.body ? <Text style={styles.body}>{card.body}</Text> : null}
          </View>
          <View style={styles.stickerWrap}>
            <Sticker icon="star" size={30} />
          </View>
          <Pressable
            onPress={() => setCard(null)}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            style={styles.close}
          >
            <Ionicons name="close" size={18} color={AppColors.onSurfaceVariant} />
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingRight: 40,
    backgroundColor: AppColors.card,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.mintBorder,
    boxShadow: Shadow.raised,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: AppColors.primary,
  },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.onSurfaceVariant,
  },
  stickerWrap: {
    position: 'absolute',
    top: -12,
    left: 52,
  },
  close: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
