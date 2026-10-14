import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { TELE_MANAS_NUMBER, type MentalHealthLevel } from '@/components/checkin/MentalHealthSupport';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { typography } from '@/styles/global';

interface MentalHealthHomeCardProps {
  level: MentalHealthLevel;
  childId: string;
  childName: string;
}

/**
 * "Hide from Home", per child. Stored with the level it was hidden at, so a
 * later, more serious answer ('crisis' after 'concern') shows the card again.
 * Web uses localStorage; native uses SecureStore (AsyncStorage is not
 * installed). Any storage failure just means the card shows.
 */
const hiddenKey = (childId: string) => `lilsteps.moodCardHidden.${childId}`;

async function readHidden(childId: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(hiddenKey(childId)) ?? null;
    return await SecureStore.getItemAsync(hiddenKey(childId));
  } catch {
    return null;
  }
}

async function writeHidden(childId: string, level: MentalHealthLevel | null) {
  try {
    if (Platform.OS === 'web') {
      if (level) globalThis.localStorage?.setItem(hiddenKey(childId), level);
      else globalThis.localStorage?.removeItem(hiddenKey(childId));
    } else if (level) {
      await SecureStore.setItemAsync(hiddenKey(childId), level);
    } else {
      await SecureStore.deleteItemAsync(hiddenKey(childId));
    }
  } catch {
    // Not saved; the choice still applies until the app restarts.
  }
}

function call(number: string) {
  Linking.openURL(`tel:${number}`).catch(() => {});
}

/**
 * Home follow-up after a mood / anxiety answer at set-up (C2, R2-16, R3-14).
 * Home is seen by anyone holding the phone (often the child), so the card is
 * discreet: no child name, no self-harm wording. It keeps Tele-MANAS 14416
 * and 112 one tap away (112 first when the set-up answers suggested risk);
 * the full crisis wording stays in the Mood check-in. "Book a doctor" is
 * already on the check-in card below, so it is not repeated here. The parent
 * can hide it from Home (per child) or review the answers in Profile.
 */
export function MentalHealthHomeCard({ level, childId, childName }: MentalHealthHomeCardProps) {
  // Keyed by child; no entry for this child yet = still reading storage
  // (render nothing, so the card never flashes before hiding).
  const [stored, setStored] = useState<{ childId: string; hiddenAt: string | null } | null>(null);
  const [justHiddenFor, setJustHiddenFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readHidden(childId).then((v) => {
      if (!cancelled) setStored({ childId, hiddenAt: v });
    });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  const hiddenAt = stored?.childId === childId ? stored.hiddenAt : undefined;
  const justHidden = justHiddenFor === childId;

  // Hidden at 'concern' does not hide a later 'crisis'.
  const hidden = hiddenAt === 'crisis' || (hiddenAt === 'concern' && level === 'concern');

  function hide() {
    setStored({ childId, hiddenAt: level });
    setJustHiddenFor(childId);
    void writeHidden(childId, level);
  }

  function undo() {
    setStored({ childId, hiddenAt: null });
    setJustHiddenFor(null);
    void writeHidden(childId, null);
  }

  if (hiddenAt === undefined) return null;
  if (hidden) {
    return justHidden ? (
      <View style={styles.hiddenNote} accessibilityLiveRegion="polite">
        <Text style={[typography.meta, styles.footerText]}>
          Hidden from Home. Helplines are always in the check-in under Mood.
        </Text>
        <TextButton label="Undo" onPress={undo} accessibilityLabel="Undo, show the support card on Home again" />
      </View>
    ) : null;
  }

  const crisis = level === 'crisis';
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="heart-outline" size={18} color={AppColors.secondary} style={styles.icon} />
        <View style={styles.text}>
          <Text style={styles.title}>Support is here when you need it</Text>
          <Text style={styles.body}>
            Talk to a trained counsellor at Tele-MANAS, free and open 24x7, in your language.
            {crisis ? ' In an emergency, call 112.' : ''}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        {crisis ? (
          <GradientButton
            label="Call 112"
            variant="outline"
            style={styles.callButton}
            onPress={() => call('112')}
            accessibilityLabel="Call 112, emergency services"
          />
        ) : null}
        <GradientButton
          label={`Call Tele-MANAS ${TELE_MANAS_NUMBER}`}
          variant="outline"
          style={styles.callButton}
          onPress={() => call(TELE_MANAS_NUMBER)}
          accessibilityLabel={`Call Tele-MANAS on ${TELE_MANAS_NUMBER}, free mental health helpline`}
        />
        {crisis ? null : (
          <TextButton label="Call 112" onPress={() => call('112')} accessibilityLabel="Call 112, emergency services" />
        )}
      </View>
      <View style={styles.footer}>
        <Text style={[typography.meta, styles.footerText]}>Shown because of your set-up answers.</Text>
        <View style={styles.footerActions}>
          <TextButton
            label="Review answers"
            onPress={() => router.push({ pathname: '/profile/edit-child', params: { id: childId } })}
            accessibilityLabel={`Review ${childName}'s set-up answers in Profile`}
          />
          <TextButton
            label="Hide from Home"
            onPress={hide}
            accessibilityLabel="Hide this support card from Home"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    backgroundColor: AppColors.greenWash,
    borderColor: AppColors.mintBorder,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { marginTop: 1 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.secondary },
  body: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.onSurface },
  // Wraps at 200% zoom: a call button may take the full width (R2-05).
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  callButton: { maxWidth: '100%', flexShrink: 1 },
  footer: { gap: 0 },
  footerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16 },
  footerText: { flexShrink: 1 },
  hiddenNote: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 },
});
