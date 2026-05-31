import { LinearGradient } from 'expo-linear-gradient';
import { Dimensions, StyleSheet, View } from 'react-native';

import { AppColors } from '@/constants/theme';
import { GrainOverlay } from './grain-overlay';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Full-screen gradient background with decorative blurred blobs + a paper
 * grain overlay. The grain sits above the gradient/blobs but below content,
 * giving the Serene Guardian glass cards a tactile fibrous feel.
 */
export function GradientBackground() {
  return (
    <>
      <LinearGradient
        colors={[AppColors.surface, AppColors.surfaceContainer, AppColors.surfaceDim]}
        locations={[0, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, styles.blobTopLeft]} />
      <View style={[styles.blob, styles.blobBottomRight]} />
      <View style={[styles.blob, styles.blobTopRight]} />
      <GrainOverlay intensity={0.05} />
    </>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    borderRadius: 9999,
    opacity: 0.5,
  },
  blobTopLeft: {
    top: -SCREEN_HEIGHT * 0.1,
    left: -SCREEN_WIDTH * 0.1,
    width: SCREEN_WIDTH * 0.4,
    height: SCREEN_WIDTH * 0.4,
    backgroundColor: `${AppColors.primaryContainer}33`,
  },
  blobBottomRight: {
    bottom: -SCREEN_HEIGHT * 0.05,
    right: -SCREEN_WIDTH * 0.05,
    width: SCREEN_WIDTH * 0.5,
    height: SCREEN_WIDTH * 0.5,
    backgroundColor: `${AppColors.secondaryContainer}4D`,
  },
  blobTopRight: {
    top: 0,
    right: 0,
    width: 256,
    height: 256,
    backgroundColor: `${AppColors.tertiaryContainer}1A`,
  },
});
