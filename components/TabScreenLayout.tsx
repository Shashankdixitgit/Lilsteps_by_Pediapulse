import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppColors, CanvasFade } from '@/constants/theme';

interface TabScreenLayoutProps {
  children: ReactNode;
  headerContent: ReactNode;
  scrollContentStyle?: ViewStyle;
  headerPaddingBottom?: number;
}

/** Space reserved under the floating header (title row + fade). */
export const TAB_HEADER_HEIGHT = 64;
const HEADER_HEIGHT = TAB_HEADER_HEIGHT;

const GradientFade = memo(function GradientFade() {
  return (
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
      locations={[0, 0.72, 0.8, 0.86, 0.91, 0.96, 1]} // solid behind the title, fade only below it
      style={StyleSheet.absoluteFill}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      pointerEvents="none"
    />
  );
});

export const TabScreenLayout = memo(function TabScreenLayout({
  children,
  headerContent,
  scrollContentStyle,
  headerPaddingBottom = 12,
}: TabScreenLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={[styles.headerWrapper, { paddingTop: insets.top }]} pointerEvents="box-none">
        <GradientFade />
        <View style={[styles.headerContent, { paddingBottom: headerPaddingBottom }]} pointerEvents="box-none">
          {headerContent}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + HEADER_HEIGHT, paddingBottom: 110 + insets.bottom },
          scrollContentStyle,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AppColors.surface,
  },
  headerWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderWidth: 0,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 24,
  },
});
