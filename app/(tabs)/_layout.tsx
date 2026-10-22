import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs } from 'expo-router';
import { memo, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AI_BTN_SIZE,
  AI_SPACER_W,
  BAR_CHROME_W,
  isCompactTabBar,
  MIN_LABELLED_TAB_W,
  TAB_BAR_HEIGHT,
  TAB_LABEL_MAX_SCALE,
  tabBarSpace,
} from '@/components/home/tabBarSpace';
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

const PILL_W = 56;
const PILL_H = 30;
/** Longest label ("Records" / "Vaccine"), for fitting the label on web. */
const LONGEST_LABEL_CHARS = 7;

/**
 * Tab sizing from the window width. Every tab keeps a text label (R2-17): on
 * a narrow window (small phone at 200% zoom) the AI button moves above the
 * bar so the four tabs get the whole width. Web has no adjustsFontSizeToFit,
 * so the label size is fitted here (12 → 9); native also shrinks a long
 * label to fit. Only a window too narrow for even that falls back to icons,
 * with the label kept as the accessible name.
 */
function tabMetrics(windowWidth: number) {
  const compact = isCompactTabBar(windowWidth);
  const spacer = compact ? 0 : AI_SPACER_W;
  const tabW = Math.max(0, (windowWidth - BAR_CHROME_W - spacer) / 4);
  const fitted = tabW / (LONGEST_LABEL_CHARS * 0.62);
  return {
    compact,
    spacer,
    pillW: Math.min(PILL_W, Math.max(28, tabW - 4)),
    showLabels: tabW >= MIN_LABELLED_TAB_W,
    labelSize: Platform.OS === 'web' ? Math.max(9, Math.min(12, Math.floor(fitted))) : 12,
  };
}

type TabLayout = { x: number; width: number };

/** Lavender pill that slides (translateX) behind the active tab icon. Own memoised child. */
const ActivePill = memo(function ActivePill({ layout, width }: { layout: TabLayout | undefined; width: number }) {
  const { reduceMotion } = useMotion();
  const x = useSharedValue(-1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!layout) {
      opacity.set(withTiming(0, { duration: Motion.exit }));
      return;
    }
    const target = layout.x + layout.width / 2 - width / 2;
    if (x.get() < 0 || reduceMotion) x.set(target);
    else x.set(withSpring(target, Motion.springPress));
    opacity.set(withTiming(1, { duration: Motion.exit }));
  }, [layout, width, reduceMotion, x, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: Math.max(0, x.get()) }],
  }));

  return <Animated.View style={[styles.activePill, { width }, style]} />;
});

function TabIcon({
  focused,
  icon,
  iconActive,
  width,
}: {
  focused: boolean;
  icon: string;
  iconActive: string;
  width: number;
}) {
  const { reduceMotion } = useMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (focused && !reduceMotion) {
      scale.set(withSequence(withSpring(1.12, Motion.springBouncy), withSpring(1, Motion.springBouncy)));
    }
  }, [focused, reduceMotion, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Animated.View style={[styles.iconSlot, { width }, style]}>
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
  const { width: windowWidth } = useWindowDimensions();
  const metrics = tabMetrics(windowWidth);
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
        aria-selected={focused}
      >
        <View style={styles.tabInner}>
          <TabIcon focused={focused} icon={tab.icon} iconActive={tab.iconActive} width={metrics.pillW} />
          {/* Labels scale with the system text size but are capped (like the
              native iOS tab bar), so at 200% they can't overlap each other or
              push the bar over the screen content. The full label is still
              read by screen readers via accessibilityLabel. */}
          {metrics.showLabels ? (
            <Text
              style={[styles.tabLabel, focused && styles.tabLabelActive, { fontSize: metrics.labelSize }]}
              numberOfLines={1}
              maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}
              // Native: shrink a long label (large text) to fit instead of "Vacc…".
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {label}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  }

  const bottomPadding = Math.max(insets.bottom, 12);

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPadding }]}>
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
      />

      <View style={styles.tabBarContainer}>
        {/* Subtle glass: translucent white + hairline; light blur on iOS only. */}
        <View style={styles.glassClip}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={GlassBlur} tint="light" style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={styles.glassFill} />
        </View>
        <View style={styles.tabBarInner}>
          <ActivePill layout={activeName ? layouts[activeName] : undefined} width={metrics.pillW} />
          {LEFT_TABS.map((t) => renderTab(t))}
          {metrics.spacer > 0 ? <View style={{ width: metrics.spacer }} /> : null}
          {RIGHT_TABS.map((t) => renderTab(t))}
        </View>
      </View>

      <View style={[styles.aiButtonWrapper, metrics.compact && styles.aiButtonWrapperCompact]}>
        <PressableScale
          onPress={() => router.push('/checkin')}
          hapticOnPress
          scaleTo={0.92}
          accessibilityLabel="AI check-in"
          style={styles.aiButtonOuter}
        >
          <View style={styles.aiButton}>
            <Ionicons name="sparkles" size={22} color={AppColors.lavender} />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

/**
 * Web: react-native-screens is off, so inactive tabs stay in the DOM behind
 * the active one with only aria-hidden. Their buttons stayed in the Tab
 * order (focus jumped to invisible Home buttons). display:none takes them
 * out of the focus order and the accessibility tree; native detaches
 * inactive screens itself.
 */
const HIDDEN_SCENE = { display: 'none' } as const;

/**
 * Web: when keyboard focus moves to an item low on the page, the browser
 * scrolls it into view, but the floating bar covered it (R2-17). A
 * scroll-margin on focused elements, equal to the space the bar and the AI
 * button take, makes the browser stop above the bar. Native screens reserve
 * the same space as bottom padding (useTabBarSpace).
 */
function useWebFocusScrollMargin() {
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const space = tabBarSpace(width, insets.bottom, fontScale);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = document.createElement('style');
    el.setAttribute('data-lilsteps', 'tab-focus-margin');
    el.textContent = `:focus, :focus-visible { scroll-margin-bottom: ${Math.round(space)}px; scroll-margin-top: 96px; }`;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [space]);
}

export default function TabsLayout() {
  usePushTokenRegistration();
  useWebFocusScrollMargin();
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={({ navigation }) => ({
        headerShown: false,
        sceneStyle: Platform.OS === 'web' && !navigation.isFocused() ? HIDDEN_SCENE : undefined,
      })}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="growth" />
      <Tabs.Screen name="vaccine" />
      <Tabs.Screen name="consult" />
      <Tabs.Screen name="records" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // pointerEvents in styles (the prop is deprecated on web).
  wrapper: {
    pointerEvents: 'box-none',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    borderWidth: 0,
  },
  fadeGradient: {
    pointerEvents: 'none',
    position: 'absolute',
    top: -35,
    // Absolute insets are measured from the wrapper's edge (padding ignored),
    // so 0 already spans the full width; -12 made the page scroll sideways.
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 0,
  },
  aiButtonWrapper: {
    pointerEvents: 'box-none',
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
  tabBarContainer: {
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.glassBorder,
    boxShadow: Shadow.card,
  },
  glassClip: {
    ...StyleSheet.absoluteFill,
    pointerEvents: 'none',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  glassFill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Platform.OS === 'ios' ? AppColors.glassLight : 'rgba(255, 255, 255, 0.92)',
  },
  // Compact: the button sits fully above the bar, at the right.
  aiButtonWrapperCompact: {
    top: -(AI_BTN_SIZE + 8 + 8),
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  tabBarInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: TAB_BAR_HEIGHT,
    paddingHorizontal: 4,
  },
  activePill: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 0,
    top: 9,
    height: PILL_H,
    borderRadius: Radius.full,
    backgroundColor: AppColors.mintSurface,
  },
  tabItem: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 0,
    paddingTop: 9,
    paddingBottom: 6,
  },
  tabInner: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 2,
  },
  iconSlot: {
    height: PILL_H,
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
