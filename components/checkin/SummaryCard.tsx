import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { GradientButton } from '@/components/gradient-button';
import { AppColors, FontFamily, Radius } from '@/constants/theme';

import { objectPronoun } from './MentalHealthSupport';
import { reflexive } from './pronoun';

export interface SummaryDetail {
  label: string;
  value: string;
}

export interface CheckinSummaryShape {
  chiefComplaint: string;
  details: SummaryDetail[];
  relevantHistory?: string | null;
  allergyNote?: string | null;
  /** Medicines the parent has already given (name, dose, when). */
  medicinesGiven?: string | null;
  suggestedUrgency?: 'routine' | 'soon' | 'urgent' | null;
  /** Set by the edge function when the parent raised a mood / self-harm concern. */
  mentalHealth?: 'concern' | 'crisis' | null;
  /**
   * Plain-language one-liner written for the parent (R2-08). chiefComplaint
   * is written for the doctor and can be clinical ("passive suicidal
   * ideation"), so the parent sees this when the summary has it.
   */
  parentHeadline?: string | null;
  /** The same line as the edge function names it (`parentSummary`). */
  parentSummary?: string | null;
  /**
   * R3-03: a danger sign that needs emergency care now (fit, blue lips,
   * can't wake). Optional; older rows don't have it.
   */
  emergencyNow?: boolean | null;
}

/** Label of the details row the edge function adds for medicines given. */
const MEDICINES_LABEL = 'medicines given';
/** Row the edge function adds when the parent reported a physical danger sign. */
const DANGER_LABEL = 'danger signs reported';
/**
 * Rows written only for the doctor ("Mentioned by the parent. The parent was
 * shown 112 and Tele-MANAS 14416."). The parent already sees the 112 and
 * Tele-MANAS cards, so the row is hidden from them (R2-08).
 */
const DOCTOR_ONLY_LABELS = new Set(['self-harm or suicide risk']);
/** Doctor-facing sentences that may sit inside other rows. */
const DOCTOR_ONLY_SENTENCE = /\s*(?:Mentioned by the parent\.\s*)?(?:Read the full check-in\.\s*)?The parent was shown[^.]*\.?/gi;

/**
 * "Allergies: Allergies: peanuts" -> "peanuts": the label is added on screen.
 * R3-21: the doctor-facing "Dust: ask before prescribing" is not for the
 * parent, so that instruction is dropped ("Dust").
 */
function stripAllergyPrefix(note: string): string {
  return note
    .replace(/^\s*(?:(?:known|child(?:'s)?)\s+)?(?:allerg(?:y|ies)\s*(?:note|warning)?\s*[:\-–]\s*)+/i, '')
    .replace(/\s*[:\-–;,.]?\s*\(?(?:please\s+)?(?:ask|check|confirm)\b[^.]*\bbefore prescribing\b[^.]*\)?\.?/gi, '')
    .trim();
}

/** "Allergy" for one item, "Allergies" for a list ("Eggs, Dust"). */
function allergyLabel(note: string): string {
  return /,|\band\b/i.test(note) ? 'Allergies' : 'Allergy';
}

/** The detail rows a parent should see, with doctor-only wording removed. */
function parentDetails(details: SummaryDetail[]): SummaryDetail[] {
  return details
    .filter((d) => !DOCTOR_ONLY_LABELS.has(d.label.trim().toLowerCase()))
    .map((d) => ({ ...d, value: d.value.replace(DOCTOR_ONLY_SENTENCE, '').trim() }))
    .filter((d) => d.value.length > 0);
}

export interface SummaryCardProps {
  summary: CheckinSummaryShape;
  childName: string;
  /**
   * Show the parent what the AI's urgency means (live check-in only; a past
   * visit summary should not tell anyone to call 112 now).
   */
  showUrgency?: boolean;
  /**
   * A consult is already booked from this summary: no "book within…" advice;
   * an urgent result still says to get seen today.
   */
  booked?: boolean;
  /**
   * "Dr. Madhav, today at 4:30 PM": the booking made from this summary. The
   * urgency banner then says "Booked: …" instead of booking advice (R2-08).
   */
  bookedLabel?: string | null;
  /**
   * With `booked`: whether that consult is today (null = unknown). An urgent
   * summary booked for a later day still says to get seen today (R3-08).
   */
  bookedToday?: boolean | null;
  /**
   * R3-03: overrides `summary.emergencyNow` (the summary screen reads it from
   * the saved row). Either one puts "Call 112 or go to the hospital now" first.
   */
  emergencyNow?: boolean | null;
  /** Child's recorded sex, for "herself" / "himself". */
  sex?: string | null;
  /** Shown between the urgency banner and the card (e.g. the Tele-MANAS card). */
  children?: ReactNode;
}

function callEmergency() {
  Linking.openURL('tel:112').catch(() => {});
}

/**
 * Urgency line above the summary. 'urgent': danger banner with a call-112
 * action. 'soon': a calm warning to book within a day or two. 'routine': a
 * calm, neutral line (wording pending clinical sign-off, C5).
 */
function UrgencyBanner({
  urgency,
  childName,
  booked,
  bookedLabel,
  bookedToday,
  emergencyNow,
  sex,
  mentalHealth,
  physicalSigns,
}: {
  urgency: CheckinSummaryShape['suggestedUrgency'];
  childName: string;
  booked: boolean;
  bookedLabel: string | null;
  bookedToday: boolean | null;
  emergencyNow: boolean;
  sex: string | null;
  mentalHealth: CheckinSummaryShape['mentalHealth'];
  /** The parent reported a physical danger sign (breathing, fit, ...). */
  physicalSigns: boolean;
}) {
  // R3-03 (wording pending Dr Atish sign-off, C5): an emergency danger sign
  // (fit, blue lips, can't wake) comes before any booking advice.
  if (emergencyNow) {
    return (
      <View style={[styles.banner, styles.bannerDanger]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <View style={styles.bannerRow}>
          <Ionicons name="alert-circle" size={18} color={AppColors.danger} style={styles.noteIcon} />
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, styles.dangerText]}>Call 112 or go to the hospital now</Text>
            <Text style={styles.bannerBody}>
              What you described needs emergency care now. Don&apos;t wait for an online consult.
              {bookedLabel ? ` Your booking (${bookedLabel}) is for afterwards.` : ''}
            </Text>
          </View>
        </View>
        <GradientButton
          label="Call 112"
          onPress={callEmergency}
          variant="danger"
          accessibilityLabel="Call 112, emergency services"
        />
      </View>
    );
  }
  if (urgency === 'urgent') {
    const first = !booked
      ? 'Book the earliest slot below or visit a clinic today.'
      : bookedToday === true
        ? 'Keep your consult today.'
        : bookedToday === false
          ? "Your booking isn't today. Please visit a clinic or hospital today."
          : "If your booking isn't today, visit a clinic or hospital today.";
    // S1: when the reason is mood / self-harm, the advice is about safety,
    // not breathing or fits. Physical advice is added only if a physical
    // danger sign was reported too (or when there is no mood reason).
    const moodReason = mentalHealth === 'crisis' || (mentalHealth === 'concern' && !physicalSigns);
    const mood =
      mentalHealth === 'crisis'
        ? `If ${childName} might hurt ${reflexive(sex)}, stay with ${objectPronoun(sex)} and call 112. Tele-MANAS 14416 is free and open 24x7.`
        : `If ${childName} is in danger now, call 112. Tele-MANAS 14416 is free and open 24x7.`;
    const physical = `If ${childName} is struggling to breathe, very drowsy, has a seizure or turns blue, call 112 now.`;
    const body = [first, moodReason ? mood : null, !moodReason || physicalSigns ? physical : null]
      .filter(Boolean)
      .join(' ');
    return (
      <View style={[styles.banner, styles.bannerDanger]} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <View style={styles.bannerRow}>
          <Ionicons name="alert-circle" size={18} color={AppColors.danger} style={styles.noteIcon} />
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, styles.dangerText]}>
              {bookedLabel ? `Booked: ${bookedLabel}` : `${childName} should be seen today`}
            </Text>
            <Text style={styles.bannerBody}>{body}</Text>
          </View>
        </View>
        <GradientButton
          label="Call 112"
          onPress={callEmergency}
          variant="danger"
          accessibilityLabel="Call 112, emergency services"
        />
      </View>
    );
  }
  // Booking advice is moot once a consult is booked: say what was booked.
  if (bookedLabel) {
    return (
      <View style={[styles.banner, styles.bannerCalm]}>
        <View style={styles.bannerRow}>
          <Ionicons name="calendar" size={18} color={AppColors.secondary} style={styles.noteIcon} />
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, styles.calmText]}>Booked: {bookedLabel}</Text>
            <Text style={styles.bannerBody}>
              The doctor has this summary. If {childName} gets worse before then, visit a clinic or call 112.
            </Text>
          </View>
        </View>
      </View>
    );
  }
  if (booked) return null;
  if (urgency === 'soon') {
    return (
      <View style={[styles.banner, styles.bannerWarning]}>
        <View style={styles.bannerRow}>
          <Ionicons name="time" size={18} color={AppColors.warning} style={styles.noteIcon} />
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, styles.warningText]}>Book within a day or two</Text>
            <Text style={styles.bannerBody}>If things get worse before then, visit a clinic or call 112.</Text>
          </View>
        </View>
      </View>
    );
  }
  // C5: routine wording is neutral placeholder copy, pending Dr Atish's sign-off.
  return (
    <View style={[styles.banner, styles.bannerCalm]}>
      <View style={styles.bannerRow}>
        <Ionicons name="checkmark-circle-outline" size={18} color={AppColors.secondary} style={styles.noteIcon} />
        <View style={styles.bannerText}>
          <Text style={[styles.bannerTitle, styles.calmText]}>A routine consult is fine</Text>
          <Text style={styles.bannerBody}>
            No urgent signs in what you shared. Pick a time that suits you. If {childName} gets worse, visit a clinic
            or call 112.
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * One white hairline card: "AI summary · Child" label, chief complaint (17),
 * detail rows with hairline separators, then history / allergy as plain rows
 * (no nested boxes). The allergy note keeps warning colour + icon + text.
 */
export function SummaryCard({
  summary,
  childName,
  showUrgency = false,
  booked = false,
  bookedLabel = null,
  bookedToday = null,
  emergencyNow,
  sex = null,
  children,
}: SummaryCardProps) {
  // Read defensively: a saved row may carry anything here.
  const emergency = emergencyNow === true || (summary as { emergencyNow?: unknown }).emergencyNow === true;
  // Medicines may arrive as the top-level field or as a details row (what the
  // saved row carries); show them once, as their own line.
  const isMedicinesRow = (d: SummaryDetail) => d.label.trim().toLowerCase() === MEDICINES_LABEL;
  const medicines = summary.medicinesGiven?.trim() || summary.details.find(isMedicinesRow)?.value.trim() || null;
  const details = parentDetails(summary.details.filter((d) => !isMedicinesRow(d)));
  const allergyNote = summary.allergyNote ? stripAllergyPrefix(summary.allergyNote) : '';
  // Parent-friendly headline when the summary has one. Without it, a crisis
  // summary's clinical complaint is replaced by plain words.
  const headline =
    summary.parentHeadline?.trim() ||
    summary.parentSummary?.trim() ||
    (summary.mentalHealth === 'crisis' ? `Worried about ${childName}'s mood and safety` : summary.chiefComplaint);

  const card = (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={14} color={AppColors.secondary} />
        <Text style={styles.aiLabel}>AI summary</Text>
        <Text style={styles.childName} numberOfLines={1}>
          · {childName}
        </Text>
      </View>
      <Text style={styles.complaint}>{headline}</Text>

      {details.length > 0 ? (
        <View>
          {details.map((d, i) => (
            // Labels can repeat ("Not answered" once per question).
            <View key={`${d.label}-${i}`} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{d.label}</Text>
              <Text style={styles.detailValue}>{d.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {!!medicines && (
        <View style={styles.noteRow} accessible accessibilityLabel={`Medicines given: ${medicines}`}>
          <Ionicons name="medkit-outline" size={14} color={AppColors.outline} style={styles.noteIcon} />
          <Text style={styles.noteText}>
            <Text style={styles.noteLabel}>Medicines given: </Text>
            {medicines}
          </Text>
        </View>
      )}

      {!!summary.relevantHistory && (
        <View style={styles.noteRow} accessible accessibilityLabel={`History: ${summary.relevantHistory}`}>
          <Ionicons name="time-outline" size={14} color={AppColors.outline} style={styles.noteIcon} />
          <Text style={styles.noteText}>
            <Text style={styles.noteLabel}>History: </Text>
            {summary.relevantHistory}
          </Text>
        </View>
      )}

      {!!allergyNote && (
        <View style={styles.noteRow} accessible accessibilityLabel={`${allergyLabel(allergyNote)}: ${allergyNote}`}>
          <Ionicons name="warning-outline" size={14} color={AppColors.warning} style={styles.noteIcon} />
          <Text style={[styles.noteText, styles.warningText]}>
            <Text style={[styles.noteLabel, styles.warningText]}>{allergyLabel(allergyNote)}: </Text>
            {allergyNote}
          </Text>
        </View>
      )}

      {/* C4: the disclaimer stays visible wherever an AI summary is shown. */}
      <Text style={styles.disclaimer}>AI summary of what you shared. Not a diagnosis.</Text>
    </View>
  );

  if (!showUrgency) {
    if (!children) return card;
    return (
      <View style={styles.wrap}>
        {children}
        {card}
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <UrgencyBanner
        urgency={summary.suggestedUrgency}
        childName={childName}
        booked={booked || !!bookedLabel}
        bookedLabel={bookedLabel}
        bookedToday={bookedToday}
        emergencyNow={emergency}
        sex={sex}
        mentalHealth={summary.mentalHealth}
        physicalSigns={summary.details.some((d) => d.label.trim().toLowerCase() === DANGER_LABEL)}
      />
      {children}
      {card}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  banner: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  bannerDanger: { backgroundColor: AppColors.dangerSurface, borderColor: AppColors.dangerBorder },
  bannerWarning: { backgroundColor: AppColors.warningSurface, borderColor: AppColors.warningBorder },
  bannerCalm: { backgroundColor: AppColors.greenWash, borderColor: AppColors.mintBorder },
  calmText: { color: AppColors.secondary },
  bannerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bannerText: { flex: 1, minWidth: 0, gap: 2 },
  bannerTitle: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20 },
  bannerBody: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.onSurface },
  dangerText: { color: AppColors.danger },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiLabel: { fontFamily: FontFamily.semibold, fontSize: 12, lineHeight: 16, color: AppColors.secondary },
  childName: { flexShrink: 1, fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: AppColors.muted },
  complaint: {
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: AppColors.onSurface,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  detailLabel: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.muted,
    flex: 1,
  },
  detailValue: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    flex: 2,
    textAlign: 'right',
  },
  noteRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  noteIcon: { marginTop: 2 },
  noteText: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurfaceVariant,
    flex: 1,
  },
  noteLabel: { fontFamily: FontFamily.semibold, color: AppColors.onSurface },
  warningText: { color: AppColors.warning },
  disclaimer: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.muted,
  },
});
