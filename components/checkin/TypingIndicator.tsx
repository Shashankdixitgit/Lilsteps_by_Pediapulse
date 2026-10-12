import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { SproutArt } from '@/components/mascot/Sprout';
import { useMotion } from '@/components/ui/useMotion';
import { AppColors } from '@/constants/theme';

function Dot({ v }: { v: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + v.get() * 0.6,
    transform: [{ translateY: -3 * v.get() }, { scale: 1 + v.get() * 0.2 }],
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

/** "Sprout is thinking": static Sprout (think) + three bouncing dots (reanimated, UI thread). */
export function TypingIndicator() {
  const { reduceMotion } = useMotion();
  const d1 = useSharedValue(0);
  const d2 = useSharedValue(0);
  const d3 = useSharedValue(0);

  useEffect(() => {
    const dots = [d1, d2, d3];
    if (reduceMotion) {
      dots.forEach((d) => d.set(0.6));
      return;
    }
    dots.forEach((d, i) => {
      d.set(
        withDelay(
          i * 120,
          withRepeat(
            withSequence(
              withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
              withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }),
              withTiming(0, { duration: 240 }),
            ),
            -1,
            false,
          ),
        ),
      );
    });
    return () => dots.forEach((d) => cancelAnimation(d));
  }, [reduceMotion, d1, d2, d3]);

  return (
    <View style={styles.container} accessibilityLabel="LilSteps AI is typing" accessibilityRole="text">
      <View style={styles.row}>
        <View style={styles.avatar} accessible={false} importantForAccessibility="no-hide-descendants">
          <SproutArt mood="think" size={26} />
        </View>
        <View style={styles.dots}>
          <Dot v={d1} />
          <Dot v={d2} />
          <Dot v={d3} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: AppColors.secondary },
});
