import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/context/auth';
import { useChildren, ChildWithDetails } from '@/hooks/useChildren';
import { getBracket, formatAge, AgeBracket } from '@/constants/bracketConfig';
import { dbg } from '@/lib/debug';
import { supabase } from '@/lib/supabase';

interface ChildContextState {
  /** Currently selected child */
  child: ChildWithDetails | null;
  /** All children for this parent */
  children: ChildWithDetails[];
  /** Computed age bracket from DOB */
  bracket: AgeBracket | null;
  /** Formatted age string e.g. "2y 3m" */
  age: string;
  /** Parent name from DB */
  parentName: string;
  /** Loading state */
  loading: boolean;
  /** Switch to a different child */
  selectChild: (childId: string) => void;
  /** Reload children (and their allergies, conditions, medicines) from the DB.
   *  Await it after creating or editing a child, before navigating home. */
  refetch: () => Promise<void>;
  /** Reload the parent's name (call after saving parents.name). */
  refetchParentName: () => Promise<void>;
}

const ChildContext = createContext<ChildContextState | null>(null);

/**
 * The selected child survives a relaunch. Stored per parent account; any
 * storage failure (private mode, no keychain) just means the first child is
 * selected, as before. Web uses localStorage; native uses SecureStore (the
 * app already ships it; AsyncStorage is not installed).
 */
const selectedKey = (userId: string) => `lilsteps.selectedChild.${userId}`;

async function readSelected(userId: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(selectedKey(userId)) ?? null;
    return await SecureStore.getItemAsync(selectedKey(userId));
  } catch {
    return null;
  }
}

async function writeSelected(userId: string, childId: string) {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(selectedKey(userId), childId);
    else await SecureStore.setItemAsync(selectedKey(userId), childId);
  } catch {
    // Not persisted; the selection still works for this session.
  }
}

export function ChildProvider({ children: providerChildren }: { children: ReactNode }) {
  const { user } = useAuth();
  const { children, loading, refetch } = useChildren();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const userId = user?.id ?? null;

  // Restore the last selected child for this account (and forget the previous
  // account's choice on sign-out / switch).
  useEffect(() => {
    let cancelled = false;
    setSelectedId(null);
    if (!userId) return;
    readSelected(userId).then((id) => {
      if (!cancelled && id) {
        dbg.hook('ChildProvider: restored selected child', { id });
        setSelectedId(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Auto-select first child when loaded
  useEffect(() => {
    if (children.length > 0 && (!selectedId || !children.some((c) => c.id === selectedId))) {
      dbg.hook('ChildProvider: auto-selecting first child', { id: children[0].id, name: children[0].name });
      setSelectedId(children[0].id);
    }
  }, [children, selectedId]);

  const child = children.find(c => c.id === selectedId) ?? children[0] ?? null;
  // child.dob is a 'YYYY-MM-DD' string; pass it as-is so it is read as a local date.
  const bracket = child ? getBracket(child.dob) : null;
  const age = child ? formatAge(child.dob) : '';

  // Get parent name
  const [parentName, setParentName] = useState('');
  const refetchParentName = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('parents')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.name) {
      dbg.hook('ChildProvider: parent name loaded', { name: data.name });
      setParentName(data.name);
    }
  }, [user]);
  useEffect(() => {
    refetchParentName();
  }, [refetchParentName]);

  function selectChild(childId: string) {
    dbg.hook('ChildProvider: selecting child', { childId });
    setSelectedId(childId);
    if (userId) void writeSelected(userId, childId);
  }

  return (
    <ChildContext.Provider
      value={{
        child,
        children,
        bracket,
        age,
        parentName,
        loading,
        selectChild,
        refetch,
        refetchParentName,
      }}
    >
      {providerChildren}
    </ChildContext.Provider>
  );
}

export function useChild() {
  const ctx = useContext(ChildContext);
  if (!ctx) throw new Error('useChild must be used within ChildProvider');
  return ctx;
}
