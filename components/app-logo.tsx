import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { AppColors } from '@/constants/theme';
import { typography } from '@/styles/global';

/**
 * The LittleSteps brand logo — deep-purple tile with dot pattern + brand name.
 * Reusable on splash, onboarding, auth, and about screens.
 */
export function AppLogo() {
  return (
    <Animated.View entering={FadeIn.duration(800)} style={styles.container}>
      <View style={styles.icon}>
        <View style={styles.dotsContainer}>
          <View style={[styles.dot, styles.dotLarge]} />
          <View style={styles.dotRow}>
            <View style={[styles.dot, styles.dotSmall]} />
            <View style={[styles.dot, styles.dotSmall]} />
          </View>
        </View>
      </View>

      <Animated.Text
        entering={FadeInUp.delay(300).duration(600)}
        style={typography.headingXL}
      >
        LittleSteps
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 24,
  },
  icon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.primary,
  },
  dotsContainer: {
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 999,
  },
  dotLarge: {
    width: 14,
    height: 14,
    backgroundColor: AppColors.lavender,
  },
  dotSmall: {
    width: 10,
    height: 10,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 8,
  },
});
