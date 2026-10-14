import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { LANGUAGE_OPTIONS } from '@/components/onboarding/chips';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useChild } from '@/context/child';
import { parentCity, useOnboarding } from '@/context/onboarding';
import { dbg } from '@/lib/debug';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';

const CITY_OTHER = 'Other';
const CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad', CITY_OTHER];

export default function ParentDetailsScreen() {
  // Answers live in the onboarding context, so Back and forward keep them.
  const { parent, updateSection, draftLoaded } = useOnboarding();
  const { user } = useAuth();
  const { refetchParentName } = useChild();
  const [saving, setSaving] = useState(false);

  // The name typed at sign-up is already on parents.name: start with it
  // instead of asking again. Only once, so clearing the field sticks.
  // Read it for THIS user here rather than from the child context: that
  // value can still hold the previous account's name after a sign-out on
  // the same device (R3-10), and a new parent must never see it.
  const prefilled = useRef(false);
  const userId = user?.id ?? null;
  // Latest typed name, read by the lookup below without re-running it.
  const parentNameRef = useRef(parent.name);
  useEffect(() => { parentNameRef.current = parent.name; }, [parent.name]);
  useEffect(() => {
    if (prefilled.current || !draftLoaded || !userId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from('parents').select('name').eq('id', userId).maybeSingle();
      if (cancelled || prefilled.current) return;
      prefilled.current = true;
      if (error) { dbg.dbError('ParentDetails: name lookup failed', error); return; }
      const savedName = (data?.name as string | null | undefined)?.trim();
      if (savedName && !parentNameRef.current.trim()) updateSection('parent', { name: savedName });
    })();
    return () => { cancelled = true; };
  }, [draftLoaded, userId, updateSection]);

  const trimmedName = parent.name.trim();
  const canContinue = trimmedName.length > 0;

  const handleContinue = async () => {
    if (!canContinue || saving) return;
    // Save the parent's name now (parents.name), so home can greet them.
    // A failure here does not block onboarding: the name stays in context.
    if (user) {
      setSaving(true);
      // City and language are optional: NULL when not answered (R2-13).
      const { error } = await supabase
        .from('parents')
        .upsert(
          {
            id: user.id,
            email: user.email,
            name: trimmedName,
            city: parentCity(parent) || null,
            preferred_language: parent.language || null,
          },
          { onConflict: 'id' },
        );
      if (error) dbg.dbError('ParentDetails: parent upsert failed', error);
      else await refetchParentName();
      setSaving(false);
    }
    router.push('/(onboarding)/add-child');
  };

  return (
    <OnboardingShell
      screen="parent-details"
      title="About you"
      subtitle="A few details about you, saved to your profile"
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
        placeholder="e.g. Priya Sharma"
        value={parent.name}
        onChangeText={(name) => updateSection('parent', { name })}
        autoCapitalize="words"
        autoComplete="name"
      />

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>City</Text>
        <ChipGroup
          label="City"
          options={CITIES}
          selected={parent.city ? [parent.city] : []}
          onChange={(vals) => updateSection('parent', { city: vals[0] ?? '' })}
        />
        {parent.city === CITY_OTHER ? (
          <TextInputField
            label="Your city"
            placeholder="e.g. Pune"
            value={parent.cityOther}
            onChangeText={(cityOther) => updateSection('parent', { cityOther })}
            autoCapitalize="words"
          />
        ) : null}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Preferred language</Text>
        <ChipGroup
          label="Preferred language"
          options={LANGUAGE_OPTIONS}
          selected={parent.language ? [parent.language] : []}
          onChange={(vals) => updateSection('parent', { language: vals[0] ?? '' })}
        />
        <Text style={typography.caption}>
          Screens are in English for now. The AI check-in replies in the language you type in.
        </Text>
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
