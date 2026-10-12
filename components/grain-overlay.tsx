import { Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

import { AppColors } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Optional paper-grain texture. No longer used by GradientBackground (the
 * Nivaran system is flat), kept for any future photo/hero surface.
 */
export function GrainOverlay({ intensity = 0.045 }: { intensity?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: intensity }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`}>
        <Defs>
          <Pattern id="grain" width="6" height="6" patternUnits="userSpaceOnUse">
            <Circle cx="0.5" cy="0.5" r="0.5" fill={AppColors.ink} />
            <Circle cx="3" cy="1.5" r="0.4" fill={AppColors.ink} />
            <Circle cx="1.5" cy="3.5" r="0.3" fill={AppColors.ink} />
            <Circle cx="4.5" cy="4" r="0.5" fill={AppColors.ink} />
            <Circle cx="2.5" cy="5" r="0.3" fill={AppColors.ink} />
          </Pattern>
        </Defs>
        <Rect width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="url(#grain)" />
      </Svg>
    </View>
  );
}
