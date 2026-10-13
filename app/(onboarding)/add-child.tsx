import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { OnboardingShell } from '@/components/onboarding-shell';
import { AppColors, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import { typography } from '@/styles/global';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const SETUP_ITEMS: { icon: IoniconName; title: string; subtitle: string }[] = [
  {
    icon: 'person-outline',
    title: 'Basics & birth',
    subtitle: 'Name, age, biological details',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Vaccines & milestones',
    subtitle: "What's done, what's next",
  },
  {
    icon: 'trending-up-outline',
    title: 'Growth tracking',
    subtitle: 'Weight, height, development',
  },
  {
    icon: 'medkit-outline',
    title: 'Health history',
    subtitle: 'Allergies, conditions, diet',
  },
];

export default function AddChildScreen() {
  // Also the entry point for a second child (from the home header).
  const { children } = useChild();
  const isFirstChild = children.length === 0;

  return (
    <OnboardingShell
      sprout="wave"
      screen="add-child"
      title={isFirstChild ? 'Add your first child' : 'Add another child'}
      subtitle="A few quick questions to personalise care."
      ctaLabel="Let's begin"
      onCta={() => router.push('/(onboarding)/child-basics')}
    >
      <View style={styles.eyebrowRow}>
        <Text style={typography.sectionLabel}>What we&apos;ll ask about</Text>
        <View style={styles.eyebrowMeta}>
          <Ionicons name="time-outline" size={14} color={AppColors.muted} />
          <Text style={typography.meta}>~3 min</Text>
        </View>
      </View>

      <View style={styles.list}>
        {SETUP_ITEMS.map((item, idx) => (
          <Animated.View
            key={item.title}
            entering={FadeInUp.delay(120 * idx).duration(400)}
            style={[styles.row, idx > 0 && styles.rowDivider]}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={18} color={AppColors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={typography.title}>{item.title}</Text>
              <Text style={typography.meta}>{item.subtitle}</Text>
            </View>
          </Animated.View>
        ))}
      </View>

      <View style={styles.note}>
        <Ionicons name="lock-closed-outline" size={14} color={AppColors.muted} />
        <Text style={[typography.caption, styles.noteText]}>
          Your child&apos;s data is encrypted and never shared without your consent.
        </Text>
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -12,
  },
  eyebrowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  list: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  noteText: {
    flex: 1,
  },
});
