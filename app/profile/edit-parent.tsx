import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/chip-group';
import { GradientButton } from '@/components/gradient-button';
import { LANGUAGE_OPTIONS, RELATIONSHIP_OPTIONS, fromChips, toChips } from '@/components/onboarding/chips';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, FontFamily } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useChild } from '@/context/child';
import { dbg } from '@/lib/debug';
import { fetchParentExtras } from '@/lib/parentProfile';
import { supabase } from '@/lib/supabase';
import { layout, typography } from '@/styles/global';

/** Profile > Parent: the parent's (or guardian's) name, relationship, city and language. */
export default function EditParentScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { parentName, refetchParentName } = useChild();
  const [name, setName] = useState(parentName);
  const [relationship, setRelationship] = useState('');
  const [city, setCity] = useState('');
  const [language, setLanguage] = useState('');
  const [initial, setInitial] = useState({ relationship: '', city: '', language: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetchParentExtras(user.id).then((x) => {
      if (!active) return;
      const loaded = { relationship: x.relationship ?? '', city: x.city ?? '', language: x.preferredLanguage ?? '' };
      setInitial(loaded);
      setRelationship(loaded.relationship);
      setCity(loaded.city);
      setLanguage(loaded.language);
    });
    return () => {
      active = false;
    };
  }, [user]);

  const trimmed = name.trim();
  const trimmedCity = city.trim();
  const changed =
    trimmed !== parentName ||
    relationship !== initial.relationship ||
    trimmedCity !== initial.city ||
    language !== initial.language;
  const canSave = !!user && trimmed.length > 0 && changed && !saving;

  async function save() {
    if (!canSave || !user) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('parents')
      .update({
        name: trimmed,
        relationship: relationship || null,
        city: trimmedCity || null,
        preferred_language: language || null,
      })
      .eq('id', user.id);
    if (err) {
      dbg.dbError('EditParent: update failed', err);
      setError('Could not save your details. Please check your connection and try again.');
      setSaving(false);
      return;
    }
    await refetchParentName();
    setSaving(false);
    router.back();
  }

  return (
    <View style={[layout.screenContainer, { paddingTop: insets.top }]}>
      <ScreenHeader title="Your details" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'android' ? 'height' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <TextInputField
            label="Full name"
            hint="(Parent or Guardian)"
            hintInline
            placeholder="e.g. Priya Sharma"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            returnKeyType="done"
          />
          <Text style={typography.caption}>Doctors see this name when you book a consult or send a message.</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Your relationship to the child</Text>
            <ChipGroup
              options={RELATIONSHIP_OPTIONS}
              selected={toChips(relationship)}
              onChange={(vals) => setRelationship(fromChips(vals))}
            />
          </View>

          <TextInputField
            label="City"
            placeholder="e.g. Pune"
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
          />

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Preferred language</Text>
            <ChipGroup
              options={LANGUAGE_OPTIONS}
              selected={toChips(language)}
              onChange={(vals) => setLanguage(fromChips(vals))}
            />
            <Text style={typography.caption}>Screens are in English for now. The AI check-in replies in the language you type in.</Text>
          </View>

          {error ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
          <GradientButton label="Save" onPress={save} loading={saving} disabled={!canSave} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  fieldGroup: { gap: 8 },
  fieldLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
  },
  errorText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: AppColors.danger,
    textAlign: 'center',
  },
});
