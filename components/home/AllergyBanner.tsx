import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily, Radius } from '@/constants/theme';

interface AllergyBannerProps {
  allergies: string[];
}

export function AllergyBanner({ allergies }: AllergyBannerProps) {
  if (allergies.length === 0) return null;
  return (
    <View style={styles.banner}>
      <Ionicons name="alert-circle" size={16} color={AppColors.danger} />
      <View style={styles.text}>
        <Text style={styles.label}>Allergy on file: </Text>
        <Text style={styles.names}>{allergies.join(', ')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: AppColors.dangerSurface,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
  },
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.danger,
  },
  names: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.danger,
  },
});
