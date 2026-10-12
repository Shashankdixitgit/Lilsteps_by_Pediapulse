import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { AppColors } from '@/constants/theme';

const SLEEP_HOURS = ['6–7 hrs', '8–9 hrs', '10–11 hrs', '12–14 hrs'];
const SLEEP_CONCERNS = ['Bedwetting', 'Night terrors', 'Snoring', 'None'];
const DENTAL_VISIT = ['Within 6 months', '6–12 months', 'Over a year', 'Never'];
const DENTAL_CONCERNS = ['Cavities', 'Teeth grinding', 'None'];

export default function SleepDentalScreen() {
  const [hours, setHours] = useState<string[]>([]);
  const [sleepConcerns, setSleepConcerns] = useState<string[]>([]);
  const [dentalVisit, setDentalVisit] = useState<string[]>([]);
  const [dentalConcerns, setDentalConcerns] = useState<string[]>([]);

  return (
    <OnboardingShell
      sprout="sleepy"
      progress={1}
      title="Sleep and dental"
      subtitle="Helps us flag concerns early"
      ctaLabel="Finish"
      onCta={() => router.push('/(onboarding)/confirm')}
    >
      <View>
        <Text style={styles.fieldLabel}>Sleep hours per night</Text>
        <ChipGroup options={SLEEP_HOURS} selected={hours} onChange={setHours} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Any sleep concerns?</Text>
        <ChipGroup
          options={SLEEP_CONCERNS}
          selected={sleepConcerns}
          onChange={setSleepConcerns}
          multiSelect
          noneValue="None"
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Last dental visit</Text>
        <ChipGroup options={DENTAL_VISIT} selected={dentalVisit} onChange={setDentalVisit} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Dental concerns</Text>
        <ChipGroup
          options={DENTAL_CONCERNS}
          selected={dentalConcerns}
          onChange={setDentalConcerns}
          multiSelect
          noneValue="None"
        />
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
