import '../global.css';

import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HeroUINativeProvider } from 'heroui-native';

import { AuthProvider } from '@/context/auth';
import { ChildProvider } from '@/context/child';
import { ErrorBoundary } from '@/components/error-boundary';
import { analytics, crash } from '@/lib/observability';

SplashScreen.preventAutoHideAsync();

// One-shot observability init. The current implementations are no-op stubs
// (see lib/observability.ts) — they'll do real work once Sentry/PostHog are
// wired (D6/D7).
crash.init();
analytics.init();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
      analytics.track('app_opened');
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <HeroUINativeProvider>
          <AuthProvider>
          <ChildProvider>
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
                name="chat"
                options={{ animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="prescriptions"
                options={{ animation: 'slide_from_right' }}
              />
            </Stack>
            <StatusBar style="dark" />
          </ChildProvider>
        </AuthProvider>
        </HeroUINativeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
