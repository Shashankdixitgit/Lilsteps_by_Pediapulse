import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';

/**
 * Home shortcut to the health log (app/health-log): one hairline card row
 * with an icon well, title, one-line hint and a chevron.
 */
export function HealthLogCard({ childName, onPress }: { childName: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      bg={AppColors.card}
      bgPressed={AppColors.surfaceContainerLow}
      accessibilityRole="button"
      accessibilityLabel={`Health log. Note ${childName}'s symptoms, medicines or a photo`}
      style={styles.card}
    >
      <View style={styles.well}>
        <Ionicons name="journal-outline" size={Size.iconRow} color={AppColors.primary} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>Health log</Text>
        <Text style={styles.sub}>Note symptoms, medicines or a photo</Text>
      </View>
      <Ionicons name="chevron-forward" size={Size.iconRow} color={AppColors.outlineVariant} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  well: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Size.iconWell / 2,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  sub: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
});
