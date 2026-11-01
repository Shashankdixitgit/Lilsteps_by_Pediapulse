import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

import { isSessionEndedResponse, markSessionEnded } from "./sessionEnded";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file at the project root, then restart the dev server with `npx expo start -c` to clear the cache.",
  );
}

/**
 * SecureStore has a 2048-byte limit per item on iOS.
 * Supabase session JWTs can exceed this, so we chunk large values
 * across multiple keys. On web, we fall back to localStorage.
 */
const CHUNK_SIZE = 1800; // conservative, under 2048

const getWebStorage = (): Storage | null => {
  if (Platform.OS !== "web") return null;
  if (typeof globalThis === "undefined") return null;

  try {
    if (!("localStorage" in globalThis)) return null;
    const ls = globalThis.localStorage as unknown;
    // Expo's web SSR (Node) sometimes injects a broken localStorage stub
    // (e.g. `--localstorage-file` without a valid path). Verify it actually
    // implements the Storage API before handing it to Supabase.
    if (
      !ls ||
      typeof (ls as Storage).getItem !== "function" ||
      typeof (ls as Storage).setItem !== "function" ||
      typeof (ls as Storage).removeItem !== "function"
    ) {
      return null;
    }
    return ls as Storage;
  } catch {
    // localStorage can throw in SSR or locked-down contexts
    return null;
  }
};

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const webStorage = getWebStorage();
    if (webStorage) {
      return webStorage.getItem(key);
    }
    try {
      const raw = await SecureStore.getItemAsync(key);
      if (raw === null) return null;

      // Check if value was chunked
      if (raw.startsWith("__chunked__:")) {
        const count = parseInt(raw.split(":")[1], 10);
        const chunks: string[] = [];
        for (let i = 0; i < count; i++) {
          const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
          if (chunk === null) return null; // corrupted, treat as missing
          chunks.push(chunk);
        }
        return chunks.join("");
      }
      return raw;
    } catch {
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    const webStorage = getWebStorage();
    if (webStorage) {
      webStorage.setItem(key, value);
      return;
    }
    try {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
      // Chunk the value
      const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "g")) ?? [];
      await SecureStore.setItemAsync(key, `__chunked__:${chunks.length}`);
      await Promise.all(
        chunks.map((chunk, i) =>
          SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk),
        ),
      );
    } catch {
      // Silent fail — better than crashing; session won't persist
    }
  },

  removeItem: async (key: string): Promise<void> => {
    const webStorage = getWebStorage();
    if (webStorage) {
      webStorage.removeItem(key);
      return;
    }
    try {
      const raw = await SecureStore.getItemAsync(key);
      if (raw?.startsWith("__chunked__:")) {
        const count = parseInt(raw.split(":")[1], 10);
        await Promise.all(
          Array.from({ length: count }, (_, i) =>
            SecureStore.deleteItemAsync(`${key}_chunk_${i}`),
          ),
        );
      }
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Silent fail
    }
  },
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** True when the request carried a signed-in user's token (not the anon key). */
function hasUserToken(init?: RequestInit): boolean {
  const headers = new Headers(init?.headers);
  const auth = headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return !!token && token !== supabaseAnonKey;
}

let endingSession = false;

/**
 * Every request goes through here. A 401 from one of our Edge Functions with
 * the parent's token means this phone's session has ended on the server:
 * sign this phone out (local only) so AuthGate sends the parent to sign-in
 * with a plain message (lib/sessionEnded, mobile review must-fix 8).
 */
const sessionAwareFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (!endingSession && isSessionEndedResponse(requestUrl(input), res.status, hasUserToken(init))) {
    endingSession = true;
    markSessionEnded();
    // Not awaited: the caller still gets its response (and shows the message).
    void supabase.auth
      .signOut({ scope: "local" })
      .catch(() => undefined)
      .finally(() => {
        endingSession = false;
      });
  }
  return res;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: sessionAwareFetch },
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Required for React Native — prevents URL parsing errors
  },
});
