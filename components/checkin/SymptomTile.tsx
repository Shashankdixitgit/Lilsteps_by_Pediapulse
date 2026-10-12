import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Radius } from '@/constants/theme';

import type { SymptomTileData } from './symptomTiles';

export interface SymptomTileProps {
  tile: SymptomTileData;
  active: boolean;
  /** Deprecated: tiles size themselves (even 2-column grid, height 88). Ignored. */
  size?: number;
  onToggle: (key: string) => void;
}

/**
 * Symptom tile for a 2-column grid (parent: flexDirection row, flexWrap wrap,
 * gap 12). Fixed height 88: 32 icon well (icon 18) top-left, label 15
 * SemiBold, one-line 12 muted hint. Width comes from flexBasis, not Dimensions,
 * so the grid stays even on web.
 */
export function SymptomTile({ tile, active, onToggle }: SymptomTileProps) {
  return (
    <PressableScale
      onPress={() => onToggle(tile.key)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      accessibilityLabel={`${tile.label}. ${tile.sub}`}
      scaleTo={0.98}
      style={styles.cell}
    >
      <View style={[styles.card, active && styles.cardActive]}>
        {active ? (
          <Animated.View entering={FadeIn.duration(150)} style={styles.checkBadge}>
            <Ionicons name="checkmark" size={12} color={AppColors.onPrimary} />
          </Animated.View>
        ) : null}
        <View style={[styles.icon, active && styles.iconActive]}>
          <Ionicons name={tile.icon as keyof typeof Ionicons.glyphMap} size={18} color={AppColors.primary} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
            {tile.label}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {tile.sub}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  cell: {
    flexBasis: '40%',
    flexGrow: 1,
    maxWidth: '50%',
  },
  card: {
    height: 88,
    padding: 12,
    justifyContent: 'space-between',
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  cardActive: { borderColor: AppColors.mintBorder, backgroundColor: AppColors.mintSurface },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: AppColors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.greenWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: { backgroundColor: AppColors.card },
  text: { gap: 0 },
  label: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  labelActive: { color: AppColors.primary },
  sub: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: AppColors.muted },
});
