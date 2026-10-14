import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ChildAvatar, childColorIndex } from '@/components/ChildAvatar';
import { Sheet } from '@/components/growth/Sheet';
import { COMPACT_WIDTH } from '@/components/home/useCompactWidth';
import { formatAge } from '@/constants/bracketConfig';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useChild } from '@/context/child';
import { typography } from '@/styles/global';

/** Share of the window width the trigger may take, and its floor. */
const TRIGGER_WIDTH_SHARE = 0.45;
const TRIGGER_MIN_W = 88;

/**
 * Active child's avatar + first name for the top-right of tab headers, so
 * the parent always knows whose data the tab shows. Tapping opens a sheet to
 * switch child, add one, or open the profile.
 */
export function HeaderChildAvatar({ size = 32 }: { size?: number }) {
  const { child, children, selectChild } = useChild();
  const [open, setOpen] = useState(false);
  const name = child?.name ?? '';
  // The tab headers' right slot doesn't shrink, so cap the trigger at a share
  // of the window; a long name (or large text) then wraps instead of
  // pushing the title off screen or clipping.
  const { width: windowWidth } = useWindowDimensions();
  const maxWidth = Math.max(TRIGGER_MIN_W, windowWidth * TRIGGER_WIDTH_SHARE);
  // Too narrow for title + name: avatar only (the name is in the label).
  const showName = !!name && windowWidth >= COMPACT_WIDTH;

  function choose(id: string) {
    selectChild(id);
    setOpen(false);
  }

  function go(path: '/profile' | '/(onboarding)/add-child') {
    setOpen(false);
    router.push(path);
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={name ? `Showing ${name}. Switch child` : 'Switch child'}
        hitSlop={6}
        style={({ pressed }) => [styles.trigger, { maxWidth }, pressed && styles.pressed]}
      >
        <ChildAvatar name={child?.name} id={child?.id} colorIndex={childColorIndex(children, child?.id)} size={size} />
        {/* Wraps at large text sizes instead of clipping (A3). */}
        {showName ? <Text style={styles.name}>{name}</Text> : null}
        <Ionicons name="chevron-down" size={Size.iconMeta} color={AppColors.onSurfaceVariant} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Switch child">
        <View style={styles.list}>
          {children.map((c, i) => {
            const active = c.id === child?.id;
            // Web: react-native-web only presses on Space for role=button,
            // but a radio must select on Space too (as in ChipGroup).
            const webKeys =
              Platform.OS === 'web'
                ? {
                    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
                      if (e.key === ' ' || e.key === 'Spacebar') {
                        e.preventDefault();
                        choose(c.id);
                      }
                    },
                  }
                : null;
            return (
              <Pressable
                key={c.id}
                onPress={() => choose(c.id)}
                {...webKeys}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                aria-checked={active}
                accessibilityLabel={`${c.name}, ${formatAge(c.dob)}`}
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.rowPressed]}
              >
                <ChildAvatar name={c.name} id={c.id} colorIndex={childColorIndex(children, c.id)} size={36} />
                <View style={styles.rowText}>
                  <Text style={typography.title}>{c.name}</Text>
                  <Text style={typography.meta}>{formatAge(c.dob)}</Text>
                </View>
                {active ? <Ionicons name="checkmark-circle" size={22} color={AppColors.primary} /> : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => go('/(onboarding)/add-child')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, children.length > 0 && styles.divider, pressed && styles.rowPressed]}
          >
            <View style={styles.addWell}>
              <Ionicons name="add" size={Size.iconRow} color={AppColors.secondary} />
            </View>
            <Text style={[typography.title, styles.rowText, styles.link]}>Add a child</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => go('/profile')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.profileLink, pressed && styles.pressed]}
        >
          <Text style={styles.linkText}>Profile and settings</Text>
          <Ionicons name="chevron-forward" size={Size.iconMeta} color={AppColors.secondary} />
        </Pressable>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    flexShrink: 1,
    minWidth: 0,
    paddingLeft: 4,
  },
  pressed: { opacity: 0.7 },
  name: {
    flexShrink: 1,
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    color: AppColors.onSurface,
  },
  list: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AppColors.border },
  rowPressed: { backgroundColor: AppColors.surfaceContainerLow },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  addWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.mintSurface,
  },
  link: { color: AppColors.secondary },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    minHeight: 44,
  },
  linkText: { fontFamily: FontFamily.semibold, fontSize: 15, color: AppColors.secondary },
});
