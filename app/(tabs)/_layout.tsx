import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppColors } from '@/constants/theme';
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

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const rightTabs = RIGHT_TABS;

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

  function renderTab(tab: { name: string; icon: string; iconActive: string }) {
    const idx = getRouteIndex(tab.name);
    const focused = idx !== -1 && state.index === idx;
    const label = TAB_LABELS[tab.name] || tab.name;

    return (
      <Pressable
        key={tab.name}
        style={styles.tabItem}
        onPress={() => pressTab(tab.name)}
        android_ripple={null}
      >
        <View style={styles.tabInner}>
          <Ionicons
            name={(focused ? tab.iconActive : tab.icon) as any}
            size={24}
            color={focused ? AppColors.primary : AppColors.onSurfaceVariant}
          />
          <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
            {label}
          </Text>
        </View>
      </Pressable>
    );
  }

  const bottomPadding = Math.max(insets.bottom, 12);

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPadding }]} pointerEvents="box-none">
      {/* Gradient fade: transparent at top → solid at bottom */}
      <LinearGradient
        colors={[
          `${AppColors.surface}00`,
          `${AppColors.surface}20`,
          `${AppColors.surface}60`,
          `${AppColors.surface}B0`,
          `${AppColors.surface}E8`,
          AppColors.surface,
          AppColors.surface,
        ]}
        locations={[0, 0.1, 0.22, 0.35, 0.5, 0.65, 1]}
        style={styles.fadeGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
      />

      <View style={styles.aiButtonWrapper} pointerEvents="box-none">
        <Pressable 
          onPress={() => router.push('/checkin')}
          android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: true }}
        >
          <View style={styles.aiButtonOuter}>
            <LinearGradient
              colors={[AppColors.primary, AppColors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.aiButton}
            >
              <Ionicons name="sparkles" size={22} color={AppColors.onPrimary} />
            </LinearGradient>
          </View>
        </Pressable>
      </View>
      
      <View style={styles.tabBarContainer}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 80 : 0}
          tint="light"
          style={styles.blurView}
        >
          <View style={styles.tabBarInner}>
            {LEFT_TABS.map((t) => renderTab(t))}
            <View style={styles.aiButtonSpacer} />
            {rightTabs.map((t) => renderTab(t))}
          </View>
        </BlurView>
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
    top: -AI_BTN_SIZE / 2,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  aiButtonOuter: {
    borderRadius: AI_BTN_SIZE / 2 + 3,
    padding: 3,
    backgroundColor: AppColors.surface,
  },
  aiButton: {
    width: AI_BTN_SIZE,
    height: AI_BTN_SIZE,
    borderRadius: AI_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiButtonSpacer: {
    width: AI_BTN_SIZE + 20,
  },
  tabBarContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 0,
  },
  blurView: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.97)' : undefined,
    borderWidth: 0,
  },
  tabBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: 4,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(255,243,255,0.85)' : 'transparent',
    borderWidth: 0,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabLabel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    color: AppColors.onSurfaceVariant,
  },
  tabLabelActive: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: AppColors.primary,
  },
});
