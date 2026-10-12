import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';

const DIET = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Jain'];
const PICKY = ['Yes', 'No'];
const ACTIVITY = ['Very active', 'Moderately active', 'Mostly sedentary'];
const SCREEN_TIME = ['Under 1hr', '1–2hrs', '2–4hrs', 'Over 4hrs'];

export default function DietActivityScreen() {
  const [diet, setDiet] = useState<string[]>([]);
  const [picky, setPicky] = useState<string[]>([]);
  const [pickyDetails, setPickyDetails] = useState('');
  const [activity, setActivity] = useState<string[]>([]);
  const [screenTime, setScreenTime] = useState<string[]>([]);

  return (
    <OnboardingShell
      sprout="happy"
      progress={0.74}
      title="Diet and activity"
      subtitle="Daily habits help with whole-child care"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/b-vaccination')}
    >
      <View>
        <Text style={styles.fieldLabel}>Diet type</Text>
        <ChipGroup options={DIET} selected={diet} onChange={setDiet} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Extremely picky eater or major food aversions?</Text>
        <ChipGroup options={PICKY} selected={picky} onChange={setPicky} />
      </View>

      {picky.includes('Yes') && (
        <TextInputField
          placeholder="Describe food aversions"
          value={pickyDetails}
          onChangeText={setPickyDetails}
        />
      )}

      <View>
        <Text style={styles.fieldLabel}>Physical activity level</Text>
        <ChipGroup options={ACTIVITY} selected={activity} onChange={setActivity} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Average daily screen time</Text>
        <ChipGroup options={SCREEN_TIME} selected={screenTime} onChange={setScreenTime} />
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
