import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusPill } from '@/components/ui/StatusPill';
import { haptic } from '@/components/ui/useMotion';
import { VACCINE_ANSWERS, type VaccineAnswer } from '@/constants/vaccineQuestions';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { typography } from '@/styles/global';

export interface VaccineStatusItem {
  /** VaccineQuestion.id, the key in the onboarding context. */
  id: string;
  name: string;
  note: string;
  /** No dose is due yet for this child: show "Not due yet" instead of the control. */
  notDueYet?: boolean;
  /** Some doses are due and later ones are not: show a short hint. */
  laterDosesNotDue?: boolean;
}

interface VaccineStatusListProps {
  items: VaccineStatusItem[];
  /** question id -> answer (missing = not answered). */
  answers: Record<string, VaccineAnswer | undefined>;
  onChange: (id: string, answer: VaccineAnswer) => void;
}

/**
 * Onboarding vaccine checklist: one white card, hairline-separated rows.
 * Name and timing note use the full row width; the Given / Missed / Not sure
 * segmented control sits under them (segments 44 high), so long names and
 * notes never wrap one word per line.
 */
export function VaccineStatusList({ items, answers, onChange }: VaccineStatusListProps) {
  return (
    <View style={styles.card}>
      {items.map((item, idx) => {
        const current = answers[item.id];
        return (
          <View key={item.id} style={[styles.row, idx > 0 && styles.rowDivider]}>
            <View style={styles.info}>
              <View style={styles.titleRow}>
                <Text style={[typography.title, styles.name]}>{item.name}</Text>
                {item.notDueYet ? <StatusPill tone="neutral" icon="time-outline" label="Not due yet" /> : null}
              </View>
              <Text style={typography.caption}>{item.note}</Text>
              {item.laterDosesNotDue ? (
                <Text style={typography.caption}>Answer for the doses so far. Later doses are not due yet.</Text>
              ) : null}
            </View>

            {item.notDueYet ? null : (
              <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={`${item.name} status`}>
                {VACCINE_ANSWERS.map((option) => {
                  const selected = current === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => {
                        haptic('selection');
                        onChange(item.id, option);
                      }}
                      accessibilityRole="radio"
                      accessibilityLabel={option}
                      accessibilityState={{ checked: selected, selected }}
                      style={[styles.segment, selected && styles.segmentSelected]}
                    >
                      <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingHorizontal: 16,
  },
  row: {
    paddingVertical: 14,
    gap: 10,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  info: {
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flexShrink: 1,
  },
  track: {
    flexDirection: 'row',
    // 2px padding + 44px segments = 44px touch targets (DESIGN.md / WCAG 2.5.5).
    padding: 2,
    borderRadius: Radius.full,
    backgroundColor: AppColors.surfaceContainer,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  segmentSelected: {
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.mintBorder,
  },
  segmentText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurfaceVariant,
  },
  segmentTextSelected: {
    fontFamily: FontFamily.semibold,
    color: AppColors.secondary,
  },
});
