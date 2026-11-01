import { router, usePathname, useRootNavigationState, useSegments } from 'expo-router';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/context/auth';
import { setReturnTo } from '@/lib/authRedirect';
import { dbg } from '@/lib/debug';
import { sessionEndedPending } from '@/lib/sessionEnded';

/**
 * Top-level route groups a signed-out visitor may open. Everything else
 * (tabs, records, consult, check-in, profile, onboarding, …) needs a session.
 * payment-return handles a missing session itself.
 */
const PUBLIC_SEGMENTS = new Set(['(auth)', 'payment-return', '+not-found', '_sitemap']);

/** The legal pages, linked from sign-in and sign-up. */
const PUBLIC_PATHS = new Set(['profile/terms', 'profile/privacy']);

/** True for routes a signed-out visitor may open (sign-in, legal pages, …). */
export function isPublicRoute(segments: readonly string[]): boolean {
  const first = segments[0];
  return !first || PUBLIC_SEGMENTS.has(first) || PUBLIC_PATHS.has(segments.join('/'));
}

/**
 * Routes whose pre-rendered page is the same for everyone, so the browser can
 * hydrate it as is. Everything else depends on the session, the query string
 * or today's date (privacy shows the delete section only when signed in).
 */
export function isPrerenderSafe(segments: readonly string[]): boolean {
  const first = segments[0];
  return !first || first === '(auth)' || first === 'payment-return' || segments.join('/') === 'profile/terms';
}

/**
 * Web: true once the page has hydrated. Protected screens are pre-rendered at
 * build time with no session, no query string and the build day's date, so
 * the browser's first render can never match them (React #418). The root
 * layout renders them only after hydration; isPrerenderSafe pages still
 * pre-render.
 */
export function useHydrated(): boolean {
  // Server render and hydration read the server snapshot (false); the client
  // then re-renders with true. Native has no pre-render: always true.
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => Platform.OS !== 'web',
  );
}

const noopSubscribe = () => () => {};

/**
 * Route guard (mounted once in the root layout). A signed-out visitor on a
 * protected link (/records, /vaccine, /consult, …) is sent to sign-in, and
 * the link is remembered so sign-in can open it afterwards (takeReturnTo).
 * Signing out mid-session goes to the splash instead, with nothing saved.
 */
export function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const navReady = !!useRootNavigationState()?.key;
  const hadSession = useRef(false);

  useEffect(() => {
    if (!navReady || loading) return;
    if (session) {
      hadSession.current = true;
      return;
    }
    if (isPublicRoute(segments)) return;
    if (hadSession.current) {
      hadSession.current = false;
      if (sessionEndedPending()) {
        // The server ended this phone's session: sign in again (the sign-in
        // screen says why), then come back here.
        setReturnTo(pathname);
        router.replace('/(auth)/login');
        return;
      }
      // Signed out (or account deleted) on a protected screen.
      router.replace('/');
      return;
    }
    const wanted =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : pathname;
    dbg.nav(`AuthGate: signed out on ${wanted} → sign-in`);
    setReturnTo(wanted);
    router.replace('/(auth)/login');
  }, [navReady, loading, session, segments, pathname]);

  return null;
}
