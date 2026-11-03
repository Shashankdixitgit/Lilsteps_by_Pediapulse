import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { typography } from '@/styles/global';

const BRAND_MARK = require('@/assets/images/brand-mark.png');

/**
 * The LilSteps brand logo: the Heart-hands mark (same art as the app icon)
 * above the brand name. Reusable on splash, onboarding, auth, and about screens.
 */
export function AppLogo() {
  return (
    <Animated.View entering={FadeIn.duration(800)} style={styles.container}>
      <Image source={BRAND_MARK} style={styles.icon} contentFit="contain" accessible={false} />

      <Animated.Text
        entering={FadeInUp.delay(300).duration(600)}
        style={typography.headingXL}
      >
        LilSteps
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
  },
});
