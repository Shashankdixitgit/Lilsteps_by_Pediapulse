import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs } from 'expo-router';
import { memo, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui/PressableScale';
import { haptic, useMotion } from '@/components/ui/useMotion';
import { AppColors, CanvasFade, FontFamily, GlassBlur, Motion, Radius, Shadow } from '@/constants/theme';
import { usePushTokenRegistration } from '@/hooks/usePushToken';

const LEFT_TABS = [
  { name: 'index', icon: 'home-outline', iconActive: 'home' },
  { name: 'growth', icon: 'bar-chart-outline', iconActive: 'bar-chart' },
] as const;

// Vaccine is shown for ALL ages 0–15. Tdap, HPV, and boosters are due 9+,
// so the previous "swap Vaccine for Consult on 5+" hid important reminders.
// Booking remains reachable via Home → Book and the check-in summary CTA.
const RIGHT_TABS = [
  { name: 'vaccine', icon: 'medical-outline', iconActive: 'medical' },
  { name: 'records', icon: 'folder-open-outline', iconActive: 'folder-open' },
] as const;

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  growth: 'Growth',
  vaccine: 'Vaccine',
  records: 'Records',
  consult: 'Consult',
};

const AI_BTN_SIZE = 52;
const PILL_W = 56;
const PILL_H = 30;

type TabLayout = { x: number; width: number };

/** Mint pill that slides (translateX) behind the active tab icon. Own memoised child. */
const ActivePill = memo(function ActivePill({ layout }: { layout: TabLayout | undefined }) {
  const { reduceMotion } = useMotion();
  const x = useSharedValue(-1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!layout) {
      opacity.set(withTiming(0, { duration: Motion.exit }));
      return;
    }
    const target = layout.x + layout.width / 2 - PILL_W / 2;
    if (x.get() < 0 || reduceMotion) x.set(target);
    else x.set(withSpring(target, Motion.springPress));
    opacity.set(withTiming(1, { duration: Motion.exit }));
  }, [layout, reduceMotion, x, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: Math.max(0, x.get()) }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.activePill, style]} />;
});

function TabIcon({ focused, icon, iconActive }: { focused: boolean; icon: string; iconActive: string }) {
  const { reduceMotion } = useMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (focused && !reduceMotion) {
      scale.set(withSequence(withSpring(1.12, Motion.springBouncy), withSpring(1, Motion.springBouncy)));
    }
  }, [focused, reduceMotion, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Animated.View style={[styles.iconSlot, style]}>
      <Ionicons
        name={(focused ? iconActive : icon) as any}
        size={22}
        color={focused ? AppColors.primary : AppColors.outline}
      />
    </Animated.View>
  );
}

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [layouts, setLayouts] = useState<Record<string, TabLayout>>({});
  const prevIndex = useRef(state.index);

  useEffect(() => {
    if (prevIndex.current !== state.index) haptic('selection');
    prevIndex.current = state.index;
  }, [state.index]);

  function getRouteIndex(name: string) {
    return state.routes.findIndex((r) => r.name === name);
  }

  function pressTab(name: string) {
    const idx = getRouteIndex(name);
    if (idx === -1) return;
    const isFocused = state.index === idx;
    const event = navigation.emit({ type: 'tabPress', target: state.routes[idx].key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(name);
  }

  function onTabLayout(name: string, e: LayoutChangeEvent) {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => (prev[name]?.x === x && prev[name]?.width === width ? prev : { ...prev, [name]: { x, width } }));
  }

  const activeName = state.routes[state.index]?.name;

  function renderTab(tab: { name: string; icon: string; iconActive: string }) {
    const idx = getRouteIndex(tab.name);
    const focused = idx !== -1 && state.index === idx;
    const label = TAB_LABELS[tab.name] || tab.name;

    return (
      <Pressable
        key={tab.name}
        style={styles.tabItem}
        onPress={() => pressTab(tab.name)}
        onLayout={(e) => onTabLayout(tab.name, e)}
        android_ripple={null}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
      >
        <View style={styles.tabInner}>
          <TabIcon focused={focused} icon={tab.icon} iconActive={tab.iconActive} />
          <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
        </View>
      </Pressable>
    );
  }

  const bottomPadding = Math.max(insets.bottom, 12);

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPadding }]} pointerEvents="box-none">
      {/* Canvas fade: transparent at top → solid at bottom */}
      <LinearGradient
        colors={[
          CanvasFade.a0,
          CanvasFade.a13,
          CanvasFade.a38,
          CanvasFade.a69,
          CanvasFade.a91,
          CanvasFade.solid,
          CanvasFade.solid,
        ]}
        locations={[0, 0.1, 0.22, 0.35, 0.5, 0.65, 1]}
        style={styles.fadeGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
      />

      <View style={styles.tabBarContainer}>
        {/* Subtle glass: translucent white + hairline; light blur on iOS only. */}
        <View style={styles.glassClip} pointerEvents="none">
          {Platform.OS === 'ios' ? (
            <BlurView intensity={GlassBlur} tint="light" style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={styles.glassFill} />
        </View>
        <View style={styles.tabBarInner}>
          <ActivePill layout={activeName ? layouts[activeName] : undefined} />
          {LEFT_TABS.map((t) => renderTab(t))}
          <View style={styles.aiButtonSpacer} />
          {RIGHT_TABS.map((t) => renderTab(t))}
        </View>
      </View>

      <View style={styles.aiButtonWrapper} pointerEvents="box-none">
        <PressableScale
          onPress={() => router.push('/checkin')}
          hapticOnPress
          scaleTo={0.92}
          accessibilityLabel="AI check-in"
          style={styles.aiButtonOuter}
        >
          <View style={styles.aiButton}>
            <Ionicons name="sparkles" size={22} color={AppColors.mint} />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  usePushTokenRegistration();
  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="growth" />
      <Tabs.Screen name="vaccine" />
      <Tabs.Screen name="consult" />
      <Tabs.Screen name="records" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    borderWidth: 0,
  },
  fadeGradient: {
    position: 'absolute',
    top: -35,
    left: -12,
    right: -12,
    bottom: 0,
    borderWidth: 0,
  },
  aiButtonWrapper: {
    position: 'absolute',
    top: -AI_BTN_SIZE / 2 + 2,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  aiButtonOuter: {
    borderRadius: Radius.full,
    padding: 4,
    backgroundColor: AppColors.card,
    boxShadow: Shadow.raised,
  },
  aiButton: {
    width: AI_BTN_SIZE,
    height: AI_BTN_SIZE,
    borderRadius: AI_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.primary,
  },
  aiButtonSpacer: {
    width: AI_BTN_SIZE + 20,
  },
  tabBarContainer: {
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.glassBorder,
    boxShadow: Shadow.card,
  },
  glassClip: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  glassFill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Platform.OS === 'ios' ? AppColors.glassLight : 'rgba(255, 255, 255, 0.92)',
  },
  tabBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 66,
    paddingHorizontal: 4,
  },
  activePill: {
    position: 'absolute',
    left: 0,
    top: 9,
    width: PILL_W,
    height: PILL_H,
    borderRadius: Radius.full,
    backgroundColor: AppColors.mintSurface,
  },
  tabItem: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 9,
  },
  tabInner: {
    alignItems: 'center',
    gap: 2,
  },
  iconSlot: {
    height: PILL_H,
    width: PILL_W,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.muted,
  },
  tabLabelActive: {
    fontFamily: FontFamily.semibold,
    color: AppColors.primary,
  },
});
