import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { GradientBackground } from '@/components/gradient-background';
import { GradientButton } from '@/components/gradient-button';
import { Sprout, type SproutMood } from '@/components/mascot/Sprout';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { AnimatedProgress } from '@/components/ui/AnimatedProgress';
import { getOnboardingStep, ONBOARDING_STEPS, type OnboardingScreen } from '@/constants/onboardingSteps';
import { AppColors, FontFamily } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useOptionalOnboarding } from '@/context/onboarding';
import type { OnboardingPath } from '@/lib/age';
import { typography } from '@/styles/global';

const PATH_LENGTHS = Object.values(ONBOARDING_STEPS).map((s) => s.length);
/** Before the date of birth (and so the path) is known, the bar fills against
 *  the longest path: when the real total arrives the bar only moves forward,
 *  never back (R3-21 step counter). */
const MAX_PATH_STEPS = Math.max(...PATH_LENGTHS);
/** Legacy `progress` callers passed 1 on the last question screen. */
const MAX_LEGACY_FILL = 0.95;
/** Search param set by confirm's "Edit" links: the CTA returns to confirm. */
export const RETURN_TO_CONFIRM = 'confirm';

interface OnboardingShellProps {
  /** Which onboarding screen this is. The shell shows "Step X of Y" for the
   *  child's path (from the onboarding context) and a matching bar. Preferred. */
  screen?: OnboardingScreen;
  /** Override the path used for the step count (default: context bracket). */
  path?: OnboardingPath | null;
  /** @deprecated Legacy 0..1 fill, used only when `screen` is not given.
   *  Capped below 100%: confirm comes after every shell screen. */
  progress?: number;
  title: string;
  subtitle?: string;
  ctaLabel: string;
  onCta: () => void;
  /** Grey out the CTA (e.g. required fields missing). Pair with a visible hint. */
  ctaDisabled?: boolean;
  /** Show a spinner on the CTA. */
  ctaLoading?: boolean;
  subLink?: { label: string; onPress: () => void };
  footerExtra?: React.ReactNode;
  onBack?: () => void;
  /** Optional static Sprout mood shown beside the title (topic intros). */
  sprout?: SproutMood;
  children: React.ReactNode;
}

export function OnboardingShell({
  screen,
  path,
  progress,
  title,
  subtitle,
  ctaLabel,
  onCta,
  ctaDisabled,
  ctaLoading,
  subLink,
  footerExtra,
  onBack,
  sprout,
  children,
}: OnboardingShellProps) {
  const insets = useSafeAreaInsets();
  const onboarding = useOptionalOnboarding();
  const stepPath = path !== undefined ? path : onboarding?.bracket ?? null;
  // A parent who already has a child starts at "add-child", so "About you"
  // is not part of this run and must not be counted.
  const { children: existingChildren } = useChild();
  const skipParentDetails = existingChildren.length > 0;
  const stepInfo = screen ? getOnboardingStep(screen, stepPath, { skipParentDetails }) : null;

  // Opened from confirm's "Edit": the CTA goes straight back to confirm. If
  // the edit changed the child's path (a new date of birth), the questions
  // for the new path have not been answered, so the normal flow continues.
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [entryPath] = useState(stepPath);
  const returnsToConfirm = returnTo === RETURN_TO_CONFIRM && stepPath === entryPath;
  const handleCta = () => {
    if (!returnsToConfirm) {
      onCta();
      return;
    }
    if (ctaDisabled || ctaLoading) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(onboarding)/confirm');
  };

  // Fill: step / total (confirm is the last step, so a shell screen never shows
  // 100%). Before the path is known, fill against the longest path.
  const maxSteps = skipParentDetails ? MAX_PATH_STEPS - 1 : MAX_PATH_STEPS;
  const fillTotal = stepInfo ? stepInfo.total ?? maxSteps : null;
  const fill = stepInfo && fillTotal
    ? stepInfo.step / fillTotal
    : Math.min(progress ?? 0, MAX_LEGACY_FILL);
  // "Step X of N" once the path is known. Before that the number of steps
  // depends on the child's age, so only "Step X" shows (with the bar), and
  // the count never jumps from an estimate to a different exact number.
  const stepText = stepInfo
    ? stepInfo.total
      ? `Step ${stepInfo.step} of ${stepInfo.total}`
      : `Step ${stepInfo.step}`
    : null;
  const a11yText = stepText ?? `${Math.round(fill * 100)}% complete`;

  return (
    <View style={styles.container}>
      <GradientBackground />

      <View style={[styles.inner, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        {/* Header */}
        <View style={styles.header}>
          <HeaderIconButton icon="arrow-back" onPress={onBack ?? (() => router.back())} accessibilityLabel="Go back" />
          <View
            style={styles.progressWrap}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Profile setup, ${a11yText}`}
            accessibilityValue={
              stepInfo
                ? { min: 1, max: stepInfo.total ?? undefined, now: stepInfo.step, text: a11yText }
                : { min: 0, max: 100, now: Math.round(fill * 100), text: a11yText }
            }
          >
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <AnimatedProgress
                value={fill}
                animateFrom={Math.max(0, fill - 0.1)}
                fillColor={AppColors.primary}
                thumb
              />
            </View>
            {stepText ? <Text style={[typography.caption, styles.stepText]}>{stepText}</Text> : null}
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
          <GradientButton
            label={returnsToConfirm ? 'Back to review' : ctaLabel}
            onPress={handleCta}
            size="md"
            disabled={ctaDisabled}
            loading={ctaLoading}
          />
          {subLink && !returnsToConfirm ? (
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
    gap: 4,
  },
  stepText: {
    textAlign: 'right',
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
