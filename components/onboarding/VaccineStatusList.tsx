import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptic } from '@/components/ui/useMotion';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { typography } from '@/styles/global';

const VAX_STATUS = ['Given', 'Missed', 'Not sure'] as const;

interface VaccineStatusListProps {
  vaccines: { name: string; note: string }[];
  /** vaccine name -> selected status ('' or missing = none) */
  statuses: Record<string, string>;
  /** Same shape as ChipGroup single-select: called with [option]. */
  onChange: (vaccine: string, value: string[]) => void;
}

/**
 * Onboarding vaccine checklist: one white card, hairline-separated rows,
 * each with a compact 32-high Given / Missed / Not sure segmented control
 * to the right of the name.
 * Replaces the per-vaccine filled cards with three 34-high chips each.
 */
export function VaccineStatusList({ vaccines, statuses, onChange }: VaccineStatusListProps) {
  return (
    <View style={styles.card}>
      {vaccines.map((vaccine, idx) => {
        const current = statuses[vaccine.name] ?? '';
        return (
          <View key={vaccine.name} style={[styles.row, idx > 0 && styles.rowDivider]}>
            <View style={styles.info}>
              <Text style={typography.title}>{vaccine.name}</Text>
              <Text style={typography.caption}>{vaccine.note}</Text>
            </View>
            <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={`${vaccine.name} status`}>
              {VAX_STATUS.map((option) => {
                const selected = current === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      haptic('selection');
                      onChange(vaccine.name, [option]);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, selected }}
                    style={[styles.segment, selected && styles.segmentSelected]}
                  >
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  track: {
    width: 196,
    flexDirection: 'row',
    height: 32,
    padding: 2,
    borderRadius: Radius.full,
    backgroundColor: AppColors.surfaceContainer,
  },
  segment: {
    flex: 1,
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
