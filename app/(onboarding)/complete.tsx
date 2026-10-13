import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { Celebrate, type CelebrateHandle } from '@/components/celebrate/Celebrate';
import { GradientButton } from '@/components/gradient-button';
import { Sprout } from '@/components/mascot/Sprout';
import { AppColors } from '@/constants/theme';
import { layout, typography } from '@/styles/global';
import { useOnboarding } from '@/context/onboarding';

export default function CompleteScreen() {
  const { childName, reset } = useOnboarding();
  // Keep the name for this screen: the onboarding answers are cleared on
  // "Go to home" so the next "Add child" starts empty.
  const [displayName] = useState(() => childName.trim() || 'Your child');
  const celebrateRef = useRef<CelebrateHandle>(null);

  // One confetti burst on arrival (skipped under reduced motion inside Celebrate).
  useEffect(() => {
    const t = setTimeout(() => celebrateRef.current?.fire({ title: "You're all set", big: true, card: false }), 350);
    return () => clearTimeout(t);
  }, []);

  function goHome() {
    router.replace('/(tabs)');
    reset();
  }

  return (
    <View style={layout.screenContainer}>
      <View style={styles.content}>
        <Animated.View entering={FadeIn.duration(600)} style={styles.iconSection}>
          <View style={styles.blob} />
          <Sprout mood="cheer" size={96} animated />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(600)} style={styles.textSection}>
          <Text style={[typography.display, styles.center]}>You&apos;re all set</Text>
          <Text style={[typography.body, styles.subtitle]}>
            {displayName}&apos;s profile is ready for your doctor.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(600).duration(600)} style={styles.footer}>
          <GradientButton label="Go to home" onPress={goHome} />
        </Animated.View>
      </View>

      <Celebrate ref={celebrateRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconSection: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: 140,
    height: 124,
  },
  blob: {
    position: 'absolute',
    width: 136,
    height: 116,
    borderRadius: 68,
    backgroundColor: AppColors.greenWash,
  },
  textSection: {
    alignItems: 'center',
    gap: 8,
  },
  center: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 320,
  },
  footer: {
    width: '100%',
    marginTop: 32,
  },
});
