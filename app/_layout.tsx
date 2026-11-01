import '../global.css';

import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HeroUINativeProvider } from 'heroui-native';
import { Uniwind } from 'uniwind';

import { AuthProvider } from '@/context/auth';
import { ChildProvider } from '@/context/child';
import { AuthGate, isPrerenderSafe, useHydrated } from '@/components/AuthGate';
import { DevFeedback } from '@/components/dev/DevFeedback';
import { ErrorBoundary } from '@/components/error-boundary';
import { analytics, crash } from '@/lib/observability';
import { AppColors } from '@/constants/theme';

/**
 * Web on a wide window: the app is a phone app, so it keeps a phone-width
 * column (centred) instead of stretching cards across a desktop screen.
 */
const WEB_MAX_WIDTH = 520;

SplashScreen.preventAutoHideAsync();

// Light-only app (see DESIGN.md): AppColors has no dark palette, so lock
// HeroUI/uniwind to light even when the phone is in dark mode.
Uniwind.setTheme('light');

// One-shot observability init. The current implementations are no-op stubs
// (see lib/observability.ts) — they'll do real work once Sentry/PostHog are
// wired (D6/D7).
crash.init();
analytics.init();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
      analytics.track('app_opened');
    }
  }, [fontsLoaded]);

  // Web: protected screens render after hydration (see useHydrated).
  const segments = useSegments();
  const hydrated = useHydrated();
  const waitForHydration = !hydrated && !isPrerenderSafe(segments);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <HeroUINativeProvider>
          <AuthProvider>
          <ChildProvider>
            <View style={styles.page}>
            <View style={styles.column}>
            {waitForHydration ? null : (
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen
                name="(auth)"
                options={{ animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="(onboarding)"
                options={{ animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="(tabs)"
                options={{ animation: 'fade' }}
              />
              <Stack.Screen
                name="checkin"
                options={{ animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="consult"
                options={{ animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="health-log"
                options={{ animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="records"
                options={{ animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="profile"
                options={{ animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="chat/[id]"
                options={{ animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="prescriptions/[id]"
                options={{ animation: 'slide_from_right' }}
              />
            </Stack>
            )}
            </View>
            </View>
            <AuthGate />
            <StatusBar style="dark" />
            <DevFeedback />
          </ChildProvider>
        </AuthProvider>
        </HeroUINativeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? AppColors.surfaceContainerLow : AppColors.surface,
  },
  column:
    Platform.OS === 'web'
      ? {
          flex: 1,
          width: '100%',
          maxWidth: WEB_MAX_WIDTH,
          alignSelf: 'center',
          overflow: 'hidden',
          backgroundColor: AppColors.surface,
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderColor: AppColors.border,
        }
      : { flex: 1 },
});
