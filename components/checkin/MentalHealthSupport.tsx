import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { GradientButton, TextButton } from '@/components/gradient-button';
import { AppColors, FontFamily, Radius } from '@/constants/theme';

import { reflexive } from './pronoun';

/**
 * "her" / "him" / "them" from the child's recorded sex, to sit next to
 * reflexive() ("might hurt herself, stay with her"), R3-21.
 */
export function objectPronoun(sex: string | null | undefined): string {
  if (sex === 'female') return 'her';
  if (sex === 'male') return 'him';
  return 'them';
}

/**
 * C2 (decided by Shashank, Claude's suggested default; wording pending
 * Dr Atish sign-off): what a parent sees when they raise a mental-health
 * concern. 'concern': calm message + Tele-MANAS 14416 + Book a doctor.
 * 'crisis' (self-harm / suicide words): the 112 emergency card comes first.
 *
 * Shown from the "Mood" tile, in the check-in chat when the assistant detects
 * it, and on the summary. Onboarding (c-mental-health) can reuse it.
 */
export type MentalHealthLevel = 'concern' | 'crisis';

/** Tele-MANAS: Government of India mental health helpline, free, 24x7. */
export const TELE_MANAS_NUMBER = '14416';

function call(number: string) {
  Linking.openURL(`tel:${number}`).catch(() => {});
}

export interface MentalHealthSupportProps {
  level: MentalHealthLevel;
  childName: string;
  /** Child's recorded sex, for "herself" / "himself". */
  sex?: string | null;
  /** Hide "Book a doctor" (e.g. a consult is already booked). */
  hideBooking?: boolean;
  /**
   * Leave out the 112 card because the screen already shows one (the summary's
   * urgent banner carries the crisis wording and Call 112), so the parent
   * never sees two stacked Call 112 cards (R2-08).
   */
  hideDangerCard?: boolean;
}

export function MentalHealthSupport({
  level,
  childName,
  sex,
  hideBooking = false,
  hideDangerCard = false,
}: MentalHealthSupportProps) {
  return (
    <View style={styles.wrap}>
      {level === 'crisis' && !hideDangerCard ? (
        <View style={[styles.card, styles.danger]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <View style={styles.row}>
            <Ionicons name="alert-circle" size={18} color={AppColors.danger} style={styles.icon} />
            <View style={styles.text}>
              <Text style={[styles.title, styles.dangerText]}>If {childName} is in danger now, call 112</Text>
              <Text style={styles.body}>
                If {childName} might hurt {reflexive(sex)}, stay with {objectPronoun(sex)} and call 112 straight
                away. Keep medicines and sharp things out of reach.
              </Text>
            </View>
          </View>
          <GradientButton
            label="Call 112"
            variant="danger"
            onPress={() => call('112')}
            accessibilityLabel="Call 112, emergency services"
          />
        </View>
      ) : null}

      <View style={[styles.card, styles.calm]}>
        <View style={styles.row}>
          <Ionicons name="heart-outline" size={18} color={AppColors.secondary} style={styles.icon} />
          <View style={styles.text}>
            <Text style={[styles.title, styles.calmText]}>You&apos;re not alone in this</Text>
            <Text style={styles.body}>
              It&apos;s good that you&apos;re paying attention to how {childName} feels. You can talk to a trained
              counsellor at Tele-MANAS, free and open 24x7, in your language.
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <GradientButton
            label={`Call Tele-MANAS ${TELE_MANAS_NUMBER}`}
            variant="outline"
            // md, not sm: an sm label is one line and gets cut at 200% zoom.
            style={styles.callButton}
            onPress={() => call(TELE_MANAS_NUMBER)}
            accessibilityLabel={`Call Tele-MANAS on ${TELE_MANAS_NUMBER}, free mental health helpline`}
          />
          {hideBooking ? null : (
            <TextButton label="Book a doctor" chevron onPress={() => router.push('/consult/booking')} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: {
    gap: 12,
    padding: 14,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  danger: { backgroundColor: AppColors.dangerSurface, borderColor: AppColors.dangerBorder },
  calm: { backgroundColor: AppColors.greenWash, borderColor: AppColors.mintBorder },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { marginTop: 1 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20 },
  body: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.onSurface },
  dangerText: { color: AppColors.danger },
  calmText: { color: AppColors.secondary },
  // Wraps at 200% zoom / narrow screens: the call button may take the full
  // width and its label wraps instead of being cut off (R2-05).
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  callButton: { maxWidth: '100%', flexShrink: 1 },
});
