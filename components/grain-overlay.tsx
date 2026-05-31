import { Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Subtle paper grain laid over the background gradient. Renders once as
 * an SVG <Pattern> of tiny circles — no per-pixel cost, no JS bridge work.
 * Lives at the bottom of the stacking context but above the gradient.
 *
 * The Serene Guardian glass cards sit ON TOP of this overlay, so the grain
 * shows through the frosted surfaces — giving them a tactile, fibrous feel
 * instead of a flat plasticky look.
 */
export function GrainOverlay({ intensity = 0.045 }: { intensity?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: intensity }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`}>
        <Defs>
          <Pattern id="grain" width="6" height="6" patternUnits="userSpaceOnUse">
            <Circle cx="0.5" cy="0.5" r="0.5" fill="#342c38" />
            <Circle cx="3" cy="1.5" r="0.4" fill="#342c38" />
            <Circle cx="1.5" cy="3.5" r="0.3" fill="#342c38" />
            <Circle cx="4.5" cy="4" r="0.5" fill="#342c38" />
            <Circle cx="2.5" cy="5" r="0.3" fill="#342c38" />
          </Pattern>
        </Defs>
        <Rect width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="url(#grain)" />
      </Svg>
    </View>
  );
}
