import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { GradientBackground } from '@/components/gradient-background';
import { GradientButton } from '@/components/gradient-button';
import { Sprout, type SproutMood } from '@/components/mascot/Sprout';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { AnimatedProgress } from '@/components/ui/AnimatedProgress';
import { AppColors, FontFamily } from '@/constants/theme';
import { typography } from '@/styles/global';

interface OnboardingShellProps {
  progress: number;
  title: string;
  subtitle?: string;
  ctaLabel: string;
  onCta: () => void;
  subLink?: { label: string; onPress: () => void };
  footerExtra?: React.ReactNode;
  onBack?: () => void;
  /** Optional static Sprout mood shown beside the title (topic intros). */
  sprout?: SproutMood;
  children: React.ReactNode;
}

export function OnboardingShell({
  progress,
  title,
  subtitle,
  ctaLabel,
  onCta,
  subLink,
  footerExtra,
  onBack,
  sprout,
  children,
}: OnboardingShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <GradientBackground />

      <View style={[styles.inner, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        {/* Header */}
        <View style={styles.header}>
          <HeaderIconButton icon="arrow-back" onPress={onBack ?? (() => router.back())} accessibilityLabel="Go back" />
          <View style={styles.progressWrap}>
            <AnimatedProgress
              value={progress}
              animateFrom={Math.max(0, progress - 0.1)}
              fillColor={AppColors.primary}
              thumb
              accessibilityLabel="Profile setup progress"
            />
          </View>
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInUp.duration(400)}>
            <View style={styles.titleRow}>
              <Text style={[typography.heading, styles.title]}>{title}</Text>
              {sprout ? <Sprout mood={sprout} size={48} /> : null}
            </View>
            {subtitle ? <Text style={[typography.bodySM, styles.subtitle]} numberOfLines={2}>{subtitle}</Text> : null}
          </Animated.View>

          <View style={styles.content}>{children}</View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <GradientButton label={ctaLabel} onPress={onCta} size="md" />
          {subLink ? (
            <Pressable onPress={subLink.onPress} style={styles.subLinkButton} accessibilityRole="button">
              <Text style={styles.subLinkText}>{subLink.label}</Text>
            </Pressable>
          ) : null}
          {footerExtra}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.surface,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: -8,
    marginBottom: 16,
  },
  progressWrap: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  subtitle: {
    marginTop: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  title: {
    flex: 1,
  },
  content: {
    marginTop: 24,
    gap: 20,
  },
  footer: {
    paddingTop: 12,
    gap: 12,
  },
  subLinkButton: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  subLinkText: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    color: AppColors.secondary,
  },
});
