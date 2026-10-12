import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors, CanvasFade, Size } from '@/constants/theme';

export interface CheckinHeaderProps {
  title?: string;
  onBack: () => void;
  showStatusDot?: boolean;
  backDisabled?: boolean;
}

/**
 * Floating check-in header: the shared ScreenHeader (plain back 22, 17
 * SemiBold title) over a canvas fade, plus an optional "online" status dot.
 */
export function CheckinHeader({
  title = 'LilSteps AI',
  onBack,
  showStatusDot = false,
  backDisabled = false,
}: CheckinHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top }]} pointerEvents="box-none">
      <LinearGradient
        colors={[
          AppColors.surface,
          AppColors.surface,
          CanvasFade.a91,
          CanvasFade.a69,
          CanvasFade.a38,
          CanvasFade.a13,
          CanvasFade.a0,
        ]}
        locations={[0, 0.55, 0.65, 0.75, 0.84, 0.92, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
      />
      <ScreenHeader
        title={title}
        onBack={onBack}
        backDisabled={backDisabled}
        titleAccessory={showStatusDot ? <View style={styles.statusDot} accessibilityLabel="Online" /> : null}
      />
    </View>
  );
}

/** Space to reserve under the floating header (52 header + 8). */
export const CHECKIN_HEADER_HEIGHT = Size.header + 8;

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingBottom: 16 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: AppColors.success },
});
