import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { MentalHealthSupport } from '@/components/checkin/MentalHealthSupport';
import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { mentalHealthLevel } from '@/components/onboarding/mentalHealthRisk';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';
import { typography } from '@/styles/global';

/** "Not sure" and "Prefer not to say" are real answers here (R2-22): a parent
 *  should never have to pick Yes or No about their child's mental health. */
const ANSWERS = ['Yes', 'No', 'Not sure', 'Prefer not to say'];

/** The description box grows with the text, from 3 lines up to about 8. */
const DETAILS_MIN = 96;
const DETAILS_MAX = 220;
/** Inner padding of the description box, so the first line is never clipped
 *  against the border (the shared input has no vertical padding). */
const DETAILS_PAD_V = 12;

export default function MentalHealthScreen() {
  const { cMentalHealth: answers, updateSection, childName } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('cMentalHealth', patch);
  // C2: a "Yes" on mood or anxiety shows the support card (Tele-MANAS);
  // self-harm words in the description put the 112 card first.
  const concern = answers.moodChanges === 'Yes' || answers.anxietyHistory === 'Yes';
  const level = mentalHealthLevel(answers.moodChanges === 'Yes' ? answers.moodDetails : '');
  const name = childName.trim() || 'your child';
  // Native multiline inputs grow by themselves; a web textarea needs its height.
  const [detailsHeight, setDetailsHeight] = useState(DETAILS_MIN);
  const detailsStyle = {
    minHeight: DETAILS_MIN,
    paddingTop: DETAILS_PAD_V,
    paddingBottom: DETAILS_PAD_V,
    lineHeight: 22,
    alignSelf: 'stretch' as const,
    textAlignVertical: 'top' as const,
    ...(Platform.OS === 'web' ? { height: Math.min(DETAILS_MAX, Math.max(DETAILS_MIN, detailsHeight)) } : { maxHeight: DETAILS_MAX }),
  };
  // Crisis words: the 112 card sits directly under the text box (not below
  // the next question), and on web it is scrolled into view as it appears.
  const crisis = concern && level === 'crisis';
  const crisisRef = useRef<View>(null);
  useEffect(() => {
    if (!crisis || Platform.OS !== 'web') return;
    const node = crisisRef.current as unknown as { scrollIntoView?: (o: object) => void } | null;
    node?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [crisis]);

  const support = (
    <View style={styles.support} ref={crisisRef}>
      {/* The child is not saved yet, so booking waits until after Save. */}
      <MentalHealthSupport level={level} childName={name} hideBooking />
      <Text style={typography.meta}>
        Once the profile is saved, you can book a doctor from Home.
      </Text>
    </View>
  );

  return (
    <OnboardingShell
      screen="c-mental-health"
      title="Mental wellbeing"
      subtitle="Optional. A moment to think about how they are doing."
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/c-vaccination')}
    >
      <Text style={typography.meta}>
        You can skip any question. Your answers are saved to the profile and shared only with
        the doctors you book a visit with. Please also mention anything that worries you at a visit.
      </Text>

      <View>
        <Text style={styles.fieldLabel}>
          Any recent changes in mood, social withdrawal, or behaviour?
        </Text>
        <ChipGroup
          label="Any recent changes in mood, social withdrawal, or behaviour?"
          options={ANSWERS}
          selected={toChips(answers.moodChanges)}
          onChange={(v) => set({ moodChanges: fromChips(v) })}
        />
      </View>

      {answers.moodChanges === 'Yes' && (
        <TextInputField
          placeholder="Briefly describe what you've noticed"
          accessibilityLabel="Briefly describe what you've noticed"
          value={answers.moodDetails}
          onChangeText={(moodDetails) => set({ moodDetails })}
          multiline
          style={detailsStyle}
          onContentSizeChange={(e) => setDetailsHeight(e.nativeEvent.contentSize.height)}
        />
      )}

      {crisis ? support : null}

      <View>
        <Text style={styles.fieldLabel}>Any history of anxiety or depression?</Text>
        <ChipGroup
          label="Any history of anxiety or depression?"
          options={ANSWERS}
          selected={toChips(answers.anxietyHistory)}
          onChange={(v) => set({ anxietyHistory: fromChips(v) })}
        />
      </View>

      {concern && !crisis ? support : null}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  support: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
    marginBottom: 8,
  },
});
