import { StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';

interface AvatarStackProps {
  /** Number to display in the badge (e.g. "500+") */
  badgeLabel: string;
}

/**
 * Overlapping circular avatars with a count badge.
 * Reusable for showing user/specialist counts across screens.
 */
export function AvatarStack({ badgeLabel }: AvatarStackProps) {
  return (
    <View style={styles.stack}>
      <View style={[styles.avatar, { zIndex: 1 }]}>
        <View style={[styles.fill, { backgroundColor: AppColors.surfaceContainerHighest }]} />
      </View>
      <View style={[styles.avatar, styles.overlap, { zIndex: 2 }]}>
        <View style={[styles.fill, { backgroundColor: AppColors.surfaceContainerHigh }]} />
      </View>
      <View style={[styles.avatar, styles.overlap, { zIndex: 3 }]}>
        <View style={[styles.fill, { backgroundColor: AppColors.primary }]}>
          <Text style={styles.badgeText}>{badgeLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flexDirection: 'row',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: AppColors.surfaceContainerLowest,
    overflow: 'hidden',
  },
  overlap: {
    marginLeft: -12,
  },
  fill: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: AppColors.onPrimary,
  },
});
