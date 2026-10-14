import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

// One answer set for every puberty question: same "Not sure" wording, and a
// way to decline on a sensitive topic.
const ANSWERS = ['Yes', 'No', 'Not sure', 'Prefer not to say'];

export default function PubertyScreen() {
  const { childSex, cPuberty: answers, updateSection } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('cPuberty', patch);

  return (
    <OnboardingShell
      screen="c-puberty"
      title="Puberty and development"
      subtitle="Normal to discuss. Note anything you want to raise at a visit."
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/c-mental-health')}
    >
      {childSex === 'female' && (
        <>
          <View>
            <Text style={styles.fieldLabel}>Has menstruation started?</Text>
            <ChipGroup
              label="Has menstruation started?"
              options={ANSWERS}
              selected={toChips(answers.menstruation)}
              onChange={(v) => set({ menstruation: fromChips(v) })}
            />
          </View>

          {answers.menstruation === 'Yes' && (
            <>
              <View>
                <Text style={styles.fieldLabel}>Are periods regular?</Text>
                <ChipGroup
                  label="Are periods regular?"
                  options={ANSWERS}
                  selected={toChips(answers.regular)}
                  onChange={(v) => set({ regular: fromChips(v) })}
                />
              </View>

              <View>
                <Text style={styles.fieldLabel}>Any pain or irregularity?</Text>
                <ChipGroup label="Any pain or irregularity?" options={ANSWERS} selected={toChips(answers.pain)} onChange={(v) => set({ pain: fromChips(v) })} />
              </View>

              {answers.pain === 'Yes' && (
                <TextInputField
                  label="Describe the pain or irregularity"
                  placeholder="e.g. strong cramps on the first day"
                  value={answers.painDetails}
                  onChangeText={(painDetails) => set({ painDetails })}
                  multiline
                />
              )}
            </>
          )}
        </>
      )}

      {childSex === 'male' && (
        <View>
          <Text style={styles.fieldLabel}>Any concerns about growth or physical development?</Text>
          <ChipGroup
            label="Any concerns about growth or physical development?"
            options={ANSWERS}
            selected={toChips(answers.growthConcerns)}
            onChange={(v) => set({ growthConcerns: fromChips(v) })}
          />
        </View>
      )}

      <View>
        <Text style={styles.fieldLabel}>Acne or significant skin concerns?</Text>
        <ChipGroup label="Acne or significant skin concerns?" options={ANSWERS} selected={toChips(answers.acne)} onChange={(v) => set({ acne: fromChips(v) })} />
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
    marginBottom: 8,
  },
});
