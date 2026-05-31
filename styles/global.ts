import { StyleSheet } from 'react-native';

import { AppColors } from '@/constants/theme';

/**
 * Shared typography styles.
 *
 * Sole family: Plus Jakarta Sans (per DESIGN.md). Variations come from
 * weight + size, not a second typeface.
 */
export const typography = StyleSheet.create({
  // Display scales for hero moments (welcome, milestone callouts).
  displayXL: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 48,
    color: AppColors.onSurface,
    letterSpacing: -1.4,
    lineHeight: 52,
  },
  displayLG: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 36,
    color: AppColors.onSurface,
    letterSpacing: -1,
    lineHeight: 40,
  },
  displayItalic: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 36,
    color: AppColors.primary,
    letterSpacing: -0.8,
    lineHeight: 40,
  },

  headingXL: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 36,
    color: AppColors.onSurface,
    letterSpacing: -0.5,
  },
  headingLG: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 28,
    color: AppColors.onSurface,
    letterSpacing: -0.3,
  },
  headingMD: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    color: AppColors.onSurface,
  },
  bodyLG: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 18,
    color: AppColors.onSurfaceVariant,
    lineHeight: 28,
  },
  bodyMD: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 16,
    color: AppColors.onSurfaceVariant,
    lineHeight: 24,
  },
  bodySM: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: AppColors.onSurfaceVariant,
    lineHeight: 20,
  },
  labelLG: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: AppColors.onSurface,
  },
  labelSM: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    letterSpacing: 3.5,
  },
  labelXS: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
});

/**
 * Common layout patterns reused across screens.
 */
export const layout = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: AppColors.surface,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
