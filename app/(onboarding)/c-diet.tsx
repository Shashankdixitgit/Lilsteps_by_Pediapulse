import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const DIET = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Jain'];
const YES_NO = ['Yes', 'No'];

export default function DietOlderScreen() {
  const { cDiet: answers, updateSection, childName } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('cDiet', patch);
  const name = childName.trim() || 'your child';

  return (
    <OnboardingShell
      screen="c-diet"
      sprout="happy"
      title="Diet"
      subtitle="Diet at this age matters for growth. Mention any concern at a visit."
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/c-puberty')}
    >
      <View>
        <Text style={styles.fieldLabel}>Diet type</Text>
        <ChipGroup label="Diet type" options={DIET} selected={toChips(answers.diet)} onChange={(v) => set({ diet: fromChips(v) })} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Regular caffeine — tea or coffee?</Text>
        <ChipGroup label="Regular caffeine — tea or coffee?" options={YES_NO} selected={toChips(answers.caffeine)} onChange={(v) => set({ caffeine: fromChips(v) })} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Any dieting, food restriction, or body image concerns noticed?</Text>
        <ChipGroup
          label="Any dieting, food restriction, or body image concerns noticed?"
          options={YES_NO}
          selected={toChips(answers.bodyImage)}
          onChange={(v) => set({ bodyImage: fromChips(v) })}
        />
      </View>

      {answers.bodyImage === 'Yes' ? (
        // Gentle follow-up (C2 tone; wording pending Dr Atish sign-off).
        <View style={styles.note} accessibilityLiveRegion="polite">
          <Ionicons name="heart-outline" size={18} color={AppColors.secondary} style={styles.noteIcon} />
          <View style={styles.noteText}>
            <Text style={styles.noteTitle}>Thank you for noticing</Text>
            <Text style={styles.noteBody}>
              Worries about food or body shape are common at this age. Try to keep mealtimes calm and avoid
              comments on weight. It&apos;s worth talking about at {name}&apos;s next doctor visit, and we&apos;ll
              share this answer with the doctor.
            </Text>
          </View>
        </View>
      ) : null}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 14,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    backgroundColor: AppColors.greenWash,
    borderColor: AppColors.mintBorder,
  },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1, minWidth: 0, gap: 2 },
  noteTitle: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.secondary },
  noteBody: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.onSurface },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
    marginBottom: 8,
  },
});
