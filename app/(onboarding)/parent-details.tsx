import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useChild } from '@/context/child';
import { useOnboarding } from '@/context/onboarding';
import { dbg } from '@/lib/debug';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';

const CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad', 'Other'];
const LANGUAGES = ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu'];

export default function ParentDetailsScreen() {
  // Answers live in the onboarding context, so Back and forward keep them.
  const { parent, updateSection } = useOnboarding();
  const { user } = useAuth();
  const { refetchParentName } = useChild();
  const [saving, setSaving] = useState(false);

  const trimmedName = parent.name.trim();
  const canContinue = trimmedName.length > 0;

  const handleContinue = async () => {
    if (!canContinue || saving) return;
    // Save the parent's name now (parents.name), so home can greet them.
    // A failure here does not block onboarding: the name stays in context.
    if (user) {
      setSaving(true);
      const { error } = await supabase
        .from('parents')
        .upsert({ id: user.id, email: user.email, name: trimmedName }, { onConflict: 'id' });
      if (error) dbg.dbError('ParentDetails: parent name upsert failed', error);
      else await refetchParentName();
      setSaving(false);
    }
    router.push('/(onboarding)/add-child');
  };

  return (
    <OnboardingShell
      screen="parent-details"
      title="About you"
      subtitle="So we can personalise LilSteps for you"
      ctaLabel="Continue"
      onCta={handleContinue}
      ctaDisabled={!canContinue}
      ctaLoading={saving}
      footerExtra={
        !canContinue ? (
          <Text style={[typography.caption, styles.missingHint]}>Add your full name to continue</Text>
        ) : null
      }
    >
      <TextInputField
        label="Full name"
        hint="(Parent or Guardian)"
        hintInline
        placeholder="e.g. Sarah Johnson"
        value={parent.name}
        onChangeText={(name) => updateSection('parent', { name })}
        autoCapitalize="words"
        autoComplete="name"
      />

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>City</Text>
        <ChipGroup
          options={CITIES}
          selected={parent.city ? [parent.city] : []}
          onChange={(vals) => updateSection('parent', { city: vals[0] ?? '' })}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Preferred language</Text>
        <ChipGroup
          options={LANGUAGES}
          selected={parent.language ? [parent.language] : []}
          onChange={(vals) => updateSection('parent', { language: vals[0] ?? '' })}
        />
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
  },
  missingHint: {
    textAlign: 'center',
  },
});
