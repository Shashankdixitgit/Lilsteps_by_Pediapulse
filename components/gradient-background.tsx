import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppColors } from '@/constants/theme';

interface GradientBackgroundProps {
  /** `welcome` adds two soft static blobs (login, onboarding welcome/complete). */
  variant?: 'flat' | 'welcome';
}

/**
 * Full-screen page background (name kept for call-site compatibility): the
 * flat sage canvas, optionally with two soft static blobs. Rendered absolutely
 * behind content, never inside a ScrollView.
 */
export function GradientBackground({ variant = 'flat' }: GradientBackgroundProps) {
  return (
    <View pointerEvents="none" style={styles.fill}>
      {variant === 'welcome' ? (
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Circle cx="100%" cy="40" r={220} fill={AppColors.greenWash} opacity={0.9} />
          <Circle cx="0" cy="140" r={140} fill={AppColors.sunshineSurface} opacity={0.9} />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: AppColors.surface,
  },
});
