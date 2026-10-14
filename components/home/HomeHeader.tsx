import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChildAvatar, childColorIndex } from '@/components/ChildAvatar';
import { formatAge } from '@/constants/bracketConfig';
import { AppColors, CanvasFade, FontFamily, Radius, Shadow, Size } from '@/constants/theme';
import { useChild } from '@/context/child';

interface HomeHeaderProps {
  childName: string;
  avatarInitial: string;
  hasUnread: boolean;
  /** New doctor replies + new prescriptions, for the bell's accessible name. */
  unreadCount?: number;
  paddingTop: number;
  onNotifications?: () => void;
}

export function HomeHeader({
  childName,
  avatarInitial,
  hasUnread,
  unreadCount = 0,
  paddingTop,
  onNotifications,
}: HomeHeaderProps) {
  const { children, child: activeChild, selectChild } = useChild();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const canSwitch = children.length > 0;

  function handleAvatarPress() {
    if (!canSwitch) return;
    setSwitcherOpen(true);
  }

  function handleSelect(id: string) {
    selectChild(id);
    setSwitcherOpen(false);
  }

  function go(path: '/profile' | '/(onboarding)/add-child') {
    setSwitcherOpen(false);
    router.push(path);
  }

  return (
    <View style={[styles.wrapper, { paddingTop }]}>
      <LinearGradient
        colors={[
          CanvasFade.solid,
          CanvasFade.solid,
          CanvasFade.a91,
          CanvasFade.a69,
          CanvasFade.a38,
          CanvasFade.a13,
          CanvasFade.a0,
        ]}
        locations={[0, 0.35, 0.5, 0.65, 0.78, 0.9, 1]}
        style={styles.fade}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      <View style={styles.content}>
        <Pressable
          onPress={handleAvatarPress}
          style={({ pressed }) => [styles.left, { opacity: pressed && canSwitch ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Showing ${childName}. Switch child or open profile and settings`}
        >
          <ChildAvatar
            name={childName || avatarInitial}
            id={activeChild?.id}
            colorIndex={childColorIndex(children, activeChild?.id)}
            size={36}
          />
          <View style={styles.namePill}>
            {/* Wraps at large text sizes instead of cutting the name off. */}
            <Text style={styles.childNameLabel}>{childName}</Text>
            {canSwitch && children.length > 1 ? (
              <Ionicons name="chevron-down" size={14} color={AppColors.primary} />
            ) : null}
          </View>
        </Pressable>

        <View style={styles.bellWrapper}>
          <Pressable
            onPress={onNotifications}
            style={({ pressed }) => [styles.bellButton, pressed && styles.bellButtonPressed]}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={
              hasUnread
                ? unreadCount > 0
                  ? `Updates, ${unreadCount} new`
                  : 'Updates, new items'
                : 'Updates'
            }
          >
            <Ionicons name="notifications-outline" size={22} color={AppColors.onSurface} />
          </Pressable>
          {hasUnread ? <View style={styles.unreadDot} /> : null}
        </View>
      </View>

      <Modal
        visible={switcherOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSwitcherOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSwitcherOpen(false)}>
          <Pressable
            style={[styles.sheet, { marginTop: paddingTop + 64 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.sheetEyebrow}>Your children</Text>
            {children.map((c) => {
              const isActive = c.id === activeChild?.id;
              // Web: react-native-web only presses on Space for role=button,
              // but a radio must select on Space too (as in ChipGroup).
              const webKeys =
                Platform.OS === 'web'
                  ? {
                      onKeyDown: (e: { key: string; preventDefault: () => void }) => {
                        if (e.key === ' ' || e.key === 'Spacebar') {
                          e.preventDefault();
                          handleSelect(c.id);
                        }
                      },
                    }
                  : null;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => handleSelect(c.id)}
                  {...webKeys}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
                  aria-checked={isActive}
                  accessibilityLabel={`${c.name}, ${formatAge(c.dob)}`}
                  style={({ pressed }) => [
                    styles.sheetItem,
                    isActive && styles.sheetItemActive,
                    pressed && !isActive && styles.sheetItemPressed,
                  ]}
                >
                  <ChildAvatar name={c.name} id={c.id} colorIndex={childColorIndex(children, c.id)} size={36} />
                  <View style={styles.sheetItemText}>
                    <Text style={[styles.sheetItemName, isActive && styles.sheetItemNameActive]}>
                      {c.name}
                    </Text>
                    <Text style={styles.sheetItemAge}>{formatAge(c.dob)}</Text>
                  </View>
                  {isActive ? <Ionicons name="checkmark-circle" size={20} color={AppColors.secondary} /> : null}
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => go('/(onboarding)/add-child')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            >
              <Ionicons name="add" size={18} color={AppColors.primary} />
              <Text style={styles.addButtonLabel}>Add another child</Text>
            </Pressable>
            <Pressable
              onPress={() => go('/profile')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.profileLink, pressed && styles.profileLinkPressed]}
            >
              <Ionicons name="person-circle-outline" size={18} color={AppColors.secondary} />
              <Text style={styles.profileLinkLabel}>Profile and settings</Text>
              <Ionicons name="chevron-forward" size={Size.iconMeta} color={AppColors.secondary} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // pointerEvents in styles (the prop is deprecated on web).
  fade: { ...StyleSheet.absoluteFill, pointerEvents: 'none' },
  wrapper: {
    pointerEvents: 'box-none',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  content: {
    pointerEvents: 'box-none',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
    marginRight: 12,
  },
  namePill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: AppColors.surfaceContainer,
  },
  childNameLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    color: AppColors.onSurface,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  bellWrapper: {
    position: 'relative',
  },
  bellButtonPressed: {
    backgroundColor: AppColors.surfaceContainer,
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: AppColors.peach,
    borderWidth: 2,
    borderColor: AppColors.surface,
    zIndex: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: AppColors.overlay,
  },
  sheet: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.card,
    gap: 6,
    boxShadow: Shadow.raised,
  },
  sheetEyebrow: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    color: AppColors.muted,
    marginBottom: 4,
    paddingHorizontal: 6,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
  },
  sheetItemActive: {
    backgroundColor: AppColors.greenWash,
  },
  sheetItemPressed: {
    backgroundColor: AppColors.surfaceContainerLow,
  },
  addButtonPressed: {
    backgroundColor: AppColors.mintSurface,
  },
  sheetItemText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sheetItemName: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    color: AppColors.onSurface,
  },
  sheetItemAge: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: AppColors.muted,
  },
  sheetItemNameActive: {
    fontFamily: FontFamily.bold,
    color: AppColors.primary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 4,
    borderRadius: 16,
    backgroundColor: AppColors.greenWash,
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  profileLinkPressed: {
    backgroundColor: AppColors.surfaceContainerLow,
  },
  profileLinkLabel: {
    flex: 1,
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    color: AppColors.secondary,
  },
  addButtonLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    color: AppColors.primary,
  },
});
