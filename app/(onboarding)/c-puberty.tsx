import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const YES_NO = ['Yes', 'No'];
const YES_NO_UNSURE = ['Yes', 'No', 'Unsure'];
const YES_NO_NOT_SURE = ['Yes', 'No', 'Not sure'];

export default function PubertyScreen() {
  const { childSex } = useOnboarding();

  // Girl-specific
  const [menstruation, setMenstruation] = useState<string[]>([]);
  const [regular, setRegular] = useState<string[]>([]);
  const [pain, setPain] = useState<string[]>([]);
  const [painDetails, setPainDetails] = useState('');

  // Boy-specific
  const [growthConcerns, setGrowthConcerns] = useState<string[]>([]);

  // Both
  const [acne, setAcne] = useState<string[]>([]);

  return (
    <OnboardingShell
      progress={0.74}
      title="Puberty and development"
      subtitle="Normal to discuss, and helps the doctor"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/c-mental-health')}
    >
      {childSex === 'female' && (
        <>
          <View>
            <Text style={styles.fieldLabel}>Has menstruation started?</Text>
            <ChipGroup options={YES_NO_NOT_SURE} selected={menstruation} onChange={setMenstruation} />
          </View>

          {menstruation.includes('Yes') && (
            <>
              <View>
                <Text style={styles.fieldLabel}>Are periods regular?</Text>
                <ChipGroup options={YES_NO_UNSURE} selected={regular} onChange={setRegular} />
              </View>

              <View>
                <Text style={styles.fieldLabel}>Any pain or irregularity?</Text>
                <ChipGroup options={YES_NO} selected={pain} onChange={setPain} />
              </View>

              {pain.includes('Yes') && (
                <TextInputField
                  placeholder="Briefly describe"
                  value={painDetails}
                  onChangeText={setPainDetails}
                />
              )}
            </>
          )}
        </>
      )}

      {childSex === 'male' && (
        <View>
          <Text style={styles.fieldLabel}>Any concerns about growth or physical development?</Text>
          <ChipGroup options={YES_NO} selected={growthConcerns} onChange={setGrowthConcerns} />
        </View>
      )}

      <View>
        <Text style={styles.fieldLabel}>Acne or significant skin concerns?</Text>
        <ChipGroup options={YES_NO} selected={acne} onChange={setAcne} />
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
