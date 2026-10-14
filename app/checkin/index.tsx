import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiConsentCard, useAiConsent } from '@/components/checkin/AiConsent';
import { CHECKIN_HEADER_HEIGHT, CheckinHeader } from '@/components/checkin/CheckinHeader';
import { FeverInput, type TempUnit, buildFeverComplaint } from '@/components/checkin/FeverInput';
import { MentalHealthSupport } from '@/components/checkin/MentalHealthSupport';
import { SymptomTile } from '@/components/checkin/SymptomTile';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { TextInputField } from '@/components/text-input-field';
import { Sprout } from '@/components/mascot/Sprout';
import { BASE_TILES, MOOD_TILE_KEY, OTHER_TILE_KEY, getTiles } from '@/components/checkin/symptomTiles';
import { AppColors, CanvasFade, FontFamily, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useResumableCheckin } from '@/hooks/useCheckin';
import { typography } from '@/styles/global';

export default function CheckinEntryScreen() {
  const insets = useSafeAreaInsets();
  const { child, bracket } = useChild();
  const childName = child?.name ?? 'Child';
  const { resumable, dismiss } = useResumableCheckin(child?.id ?? null);
  const resumeTopic = resumable ? resumeLabel(resumable.initialComplaint) : null;
  // R2-09: one-time consent before any answer goes to Google Gemini.
  const consent = useAiConsent();
  // R2-05: one tile per row on a narrow window or with large text, so a
  // label like "Headache" never splits across two lines.
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const oneColumn = windowWidth < 360 || fontScale >= 1.3;
  const scrollRef = useRef<ScrollView>(null);
  const moodCardY = useRef<number | null>(null);

  const tiles = getTiles(bracket, child?.sex);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tempStr, setTempStr] = useState('');
  // C6: most Indian home thermometers read °F; a value over 45 typed in °C
  // is read as °F (see FeverInput).
  const [tempUnit, setTempUnit] = useState<TempUnit>('F');
  const [otherText, setOtherText] = useState('');

  const hasFever = selected.has('Fever');
  const hasOther = selected.has(OTHER_TILE_KEY);
  const hasMood = selected.has(MOOD_TILE_KEY);
  const otherMissing = hasOther && !otherText.trim();
  const consentGiven = consent.status === 'given';
  const canContinue = consentGiven && selected.size > 0 && !otherMissing;

  // R2-05: the Tele-MANAS card appears below the grid; bring it into view
  // when Mood is picked (it may be off screen, especially at large text).
  useEffect(() => {
    if (!hasMood) {
      moodCardY.current = null;
      return;
    }
    const t = setTimeout(() => {
      if (moodCardY.current !== null) scrollRef.current?.scrollTo({ y: Math.max(0, moodCardY.current - 80), animated: true });
    }, 150);
    return () => clearTimeout(t);
  }, [hasMood]);

  function toggleTile(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function buildComplaint(): string {
    const parts = Array.from(selected);
    if (hasFever) {
      const feverWithTemp = buildFeverComplaint(tempStr, tempUnit);
      if (feverWithTemp) {
        const idx = parts.indexOf('Fever');
        parts[idx] = feverWithTemp;
      }
    }
    if (hasOther) {
      // The parent's own words replace the "Something else" tile.
      parts[parts.indexOf(OTHER_TILE_KEY)] = otherText.trim();
    }
    return parts.join(', ');
  }

  return (
    <View style={styles.root}>
      <CheckinHeader onBack={() => router.back()} showStatusDot />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + CHECKIN_HEADER_HEIGHT + 8, paddingBottom: 104 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <Text style={typography.heading}>How is {childName} feeling today?</Text>
            <Text style={typography.bodySM}>Tap what&apos;s worrying you.</Text>
          </View>
          <Sprout mood="care" size={56} animated />
        </View>

        {consent.status === 'loading' ? (
          <ActivityIndicator size="small" color={AppColors.primary} />
        ) : consent.status === 'needed' ? (
          <AiConsentCard saving={consent.saving} error={consent.error} onAgree={consent.agree} />
        ) : null}

        {consentGiven ? (
        <>
        {resumable ? (
          <View style={styles.resumeCard}>
            <View style={styles.resumeText}>
              <Text style={styles.resumeTitle}>
                {resumeTopic ? `Continue your check-in about ${resumeTopic}?` : 'Continue your last check-in?'}
              </Text>
              <Text style={typography.meta}>
                Started {startedPhrase(resumable.createdAt)}. Your answers so far are saved.
              </Text>
            </View>
            <View style={styles.resumeActions}>
              <GradientButton
                label="Continue"
                size="sm"
                onPress={() => router.push({ pathname: '/checkin/chat', params: { resume: resumable.id } })}
                accessibilityLabel={resumeTopic ? `Continue your check-in about ${resumeTopic}` : 'Continue your last check-in'}
              />
              <TextButton label="Start a new one" onPress={dismiss} />
            </View>
          </View>
        ) : null}

        <View style={styles.grid}>
          {tiles.map((tile) => (
            <SymptomTile
              key={tile.key}
              tile={tile}
              active={selected.has(tile.key)}
              fullWidth={oneColumn}
              onToggle={toggleTile}
            />
          ))}
        </View>

        {hasFever ? (
          <FeverInput
            value={tempStr}
            unit={tempUnit}
            onValueChange={setTempStr}
            onUnitChange={setTempUnit}
          />
        ) : null}

        {/* C2: support straight away; the check-in still collects details for the doctor. */}
        {hasMood ? (
          <View
            onLayout={(e) => {
              moodCardY.current = e.nativeEvent.layout.y;
            }}
          >
            <MentalHealthSupport level="concern" childName={childName} sex={child?.sex} />
          </View>
        ) : null}

        {hasOther ? (
          <TextInputField
            label="What's going on?"
            placeholder={`Tell us what's worrying you about ${childName}`}
            value={otherText}
            onChangeText={setOtherText}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={500}
            autoFocus
            style={styles.otherInput}
          />
        ) : null}
        </>
        ) : null}

        <Text style={[typography.caption, styles.disclaimer]}>
          Not a diagnosis. If you book, the doctor reads your summary. Your answers are processed by Google Gemini
          to write it. In an emergency, call 112.
        </Text>
      </ScrollView>

      {/* The consent card has its own button; one primary action at a time. */}
      {consentGiven ? (
      <View style={[styles.footerWrapper, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
        <LinearGradient
          colors={[
            CanvasFade.a0,
            CanvasFade.a13,
            CanvasFade.a38,
            CanvasFade.a69,
            CanvasFade.a91,
            CanvasFade.solid,
            CanvasFade.solid,
          ]}
          locations={[0, 0.1, 0.22, 0.35, 0.5, 0.65, 1]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />
        <View style={styles.footer}>
          <GradientButton
            label={canContinue ? 'Start check-in' : otherMissing ? "Describe what's going on" : 'Pick at least one'}
            disabled={!canContinue}
            onPress={() => router.push({ pathname: '/checkin/chat', params: { complaint: buildComplaint() } })}
          />
        </View>
      </View>
      ) : null}
    </View>
  );
}

const TILE_KEYS = new Set(BASE_TILES.map((t) => t.key));
/** "Fever (temperature: 101°F)", as buildFeverComplaint writes it. */
const FEVER_WITH_TEMP = /^Fever \(temperature( entered)?: [^)]*\)$/;

/**
 * R3-21: the resume banner names the tiles the parent picked ("Fever,
 * Cough"), never words they typed: a free-text worry can be private and the
 * banner is on screen for anyone nearby. Null (a neutral "your last
 * check-in") when the check-in started from typed words.
 */
function resumeLabel(initialComplaint: string): string | null {
  const parts = initialComplaint.split(', ').map((p) => p.trim());
  const fromTiles = parts.length > 0 && parts.every((p) => TILE_KEYS.has(p) || FEVER_WITH_TEMP.test(p));
  if (!fromTiles) return null;
  return parts.map((p) => (FEVER_WITH_TEMP.test(p) ? 'Fever' : p)).join(', ');
}

/** "today at 9:40 AM" / "yesterday at 6:15 PM" (sessions are under 24 h old). */
function startedPhrase(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `today at ${time}` : `yesterday at ${time}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.surface },
  scroll: { paddingHorizontal: 20, gap: 24 },

  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroText: { flex: 1, gap: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  resumeCard: {
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.mintBorder,
    backgroundColor: AppColors.greenWash,
  },
  resumeText: { gap: 4 },
  resumeTitle: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  resumeActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },

  otherInput: { minHeight: 88, paddingTop: 12, paddingBottom: 12 },

  disclaimer: { textAlign: 'center', paddingHorizontal: 8 },

  footerWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
});
