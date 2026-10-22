/**
 * Describe Your Issue — Step 1 of booking
 *
 * User describes their concern via chips + free text.
 * "Skip" option takes them directly to slot selection.
 * Passing: doctorId → slots screen
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/chip-group';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useChild } from '@/context/child';
import { typography } from '@/styles/global';
import { WEB_DEMO } from '@/lib/webDemo';

// Bracket-specific quick complaint chips
const COMPLAINT_CHIPS: Record<string, string[]> = {
  NEWBORN:      ['Feeding issues', 'Jaundice concern', 'Crying / Colic', 'Rash / Skin', 'Breathing'],
  EARLY_INFANT: ['Feeding issues', 'Vomiting', 'Rash', 'Fever', 'Sleep trouble'],
  INFANT:       ['Fever', 'Cold / Cough', 'Rash', 'Diarrhea', 'Teething pain'],
  TODDLER_EARLY:['Fever', 'Cold / Cough', 'Ear pain', 'Not eating well', 'Rash'],
  TODDLER:      ['Fever', 'Cold', 'Tummy ache', 'Rash', 'Not eating', 'Sleep issues'],
  PRESCHOOL:    ['Fever', 'Cold', 'Tummy ache', 'Rash', 'Throat pain', 'Eye issue'],
  SCHOOL_EARLY: ['Fever', 'Headache', 'Cold', 'Tummy pain', 'Eye/Ear issue', 'Rash'],
  SCHOOL_MID:   ['Headache', 'Fever', 'Stomach pain', 'Skin concern', 'Fatigue', 'Anxiety'],
  ADOLESCENT:   ['Fatigue', 'Headache', 'Skin/Acne', 'Mental health', 'Joint pain', 'Sleep'],
};

const DEFAULT_CHIPS = ['Fever', 'Cold / Cough', 'Tummy ache', 'Rash', 'Other'];

export default function DescribeScreen() {
  const insets = useSafeAreaInsets();
  const { doctorId } = useLocalSearchParams<{ doctorId: string }>();
  const { bracket, child } = useChild();
  const chips = COMPLAINT_CHIPS[bracket ?? ''] ?? DEFAULT_CHIPS;

  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  // Web demo: a sample concern so the booking can be tried in one tap.
  const [description, setDescription] = useState(WEB_DEMO ? 'Mild fever since yesterday evening, eating a little less than usual.' : '');

  const canContinue = selectedChips.length > 0 || description.trim().length >= 3;
  const summaryText = [
    ...selectedChips,
    description.trim() ? description.trim() : null,
  ]
    .filter(Boolean)
    .join(', ');

  function goToSlots(issue?: string) {
    // Params object: expo-router encodes it once and hands it back decoded,
    // so a concern like "100% sure it's fever" survives intact.
    router.push({ pathname: '/consult/slots', params: { doctorId: doctorId ?? '', issue: issue ?? '' } });
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title="Describe issue"
        subtitle={child?.name ? `For ${child.name}` : undefined}
        right={<TextButton label="Skip" onPress={() => goToSlots()} chevron />}
      />

      {/* Step indicator */}
      <View style={styles.steps}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.stepDot, s === 1 && styles.stepDotActive]} />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.prompt}>
          <Text style={typography.heading}>What&apos;s concerning you today?</Text>
          <Text style={typography.bodySM}>Pick what applies or describe it.</Text>
        </View>

        <View style={styles.section}>
          <Text style={typography.sectionLabel}>Common concerns</Text>
          <ChipGroup options={chips} selected={selectedChips} onChange={setSelectedChips} multiSelect />
        </View>

        <TextInputField
          label="More details (optional)"
          placeholder="E.g. fever since last night, around 101°F"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          value={description}
          onChangeText={setDescription}
          style={styles.textArea}
        />

        {/* Safety: emergency note stays */}
        <View style={styles.urgentCard}>
          <Ionicons name="warning-outline" size={Size.iconRow} color={AppColors.danger} />
          <Text style={styles.urgentBody}>
            <Text style={styles.urgentTitle}>In an emergency </Text>
            (trouble breathing, seizures, unresponsive) call 112 now.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <GradientButton label="Continue" disabled={!canContinue} onPress={() => goToSlots(summaryText)} />
        {!canContinue && (
          <Text style={[typography.caption, styles.hint]}>Select at least one concern or describe the issue</Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  steps: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 8 },
  stepDot: { flex: 1, height: 3, borderRadius: 999, backgroundColor: AppColors.border },
  stepDotActive: { backgroundColor: AppColors.primary },

  scroll: { paddingHorizontal: 20, paddingTop: 16, gap: 24 },

  prompt: { gap: 4 },
  section: { gap: 8 },

  textArea: {
    minHeight: 96,
    paddingTop: 12,
    paddingBottom: 12,
    ...(Platform.OS === 'web' ? ({ resize: 'none' } as object) : null),
  },

  urgentCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: AppColors.dangerSurface,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    padding: 12,
  },
  urgentTitle: { fontFamily: FontFamily.semibold, color: AppColors.danger },
  urgentBody: { flex: 1, fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.onSurface },

  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: AppColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
    gap: 4,
  },
  hint: { textAlign: 'center' },
});
