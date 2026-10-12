import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';

interface HealthTipProps {
  tip: string;
}

export function HealthTip({ tip }: HealthTipProps) {
  return (
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <Ionicons name="bulb-outline" size={20} color={AppColors.healthGreen} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>Healthy Tip</Text>
        <Text style={styles.body}>{tip}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.healthGreenSurface,
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    borderWidth: 1, borderColor: AppColors.border,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: AppColors.healthGreenOnSurface,
  },
  body: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: AppColors.healthGreenText,
    lineHeight: 19,
    opacity: 0.85,
  },
});
