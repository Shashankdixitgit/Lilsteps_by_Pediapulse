import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Radius } from '@/constants/theme';

interface QuickActionsProps {
  onBook?: () => void;
  onGrowth?: () => void;
  onVaccines?: () => void;
  onRecords?: () => void;
}

// Pastel wells (friendly accents) with forest icons: contrast 8-10:1.
const ACTIONS = [
  { key: 'book', label: 'Book', icon: 'calendar-outline', well: AppColors.mintSurface, wellPressed: AppColors.mintBorder },
  { key: 'growth', label: 'Growth', icon: 'trending-up-outline', well: AppColors.skySurface, wellPressed: AppColors.infoBorder },
  { key: 'vaccines', label: 'Vaccines', icon: 'shield-checkmark-outline', well: AppColors.sunshineSurface, wellPressed: AppColors.warningBorder },
  { key: 'records', label: 'Records', icon: 'folder-open-outline', well: AppColors.peachSurface, wellPressed: AppColors.dangerBorder },
] as const;

export function QuickActions({ onBook, onGrowth, onVaccines, onRecords }: QuickActionsProps) {
  const handlers = {
    book: onBook ?? (() => {}),
    growth: onGrowth ?? (() => {}),
    vaccines: onVaccines ?? (() => {}),
    records: onRecords ?? (() => {}),
  };

  return (
    <View style={styles.row}>
      {ACTIONS.map((action) => (
        <PressableScale
          key={action.key}
          style={styles.item}
          onPress={handlers[action.key]}
          accessibilityLabel={action.label}
          scaleTo={0.94}
        >
          <View style={[styles.well, { backgroundColor: action.well }]}>
            <Ionicons name={action.icon} size={26} color={AppColors.primary} />
          </View>
          <Text style={styles.label}>{action.label}</Text>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  well: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppColors.card,
  },
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    color: AppColors.onSurface,
  },
});
