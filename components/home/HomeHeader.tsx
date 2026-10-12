import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChildAvatar, childColorIndex } from '@/components/ChildAvatar';
import { AppColors, CanvasFade, FontFamily, Radius, Shadow } from '@/constants/theme';
import { useChild } from '@/context/child';

interface HomeHeaderProps {
  childName: string;
  avatarInitial: string;
  hasUnread: boolean;
  paddingTop: number;
  onNotifications?: () => void;
}

export function HomeHeader({
  childName,
  avatarInitial,
  hasUnread,
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

  function handleAddChild() {
    setSwitcherOpen(false);
    router.push('/(onboarding)/add-child');
  }

  return (
    <View style={[styles.wrapper, { paddingTop }]} pointerEvents="box-none">
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
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
      />

      <View style={styles.content} pointerEvents="box-none">
        <Pressable
          onPress={handleAvatarPress}
          style={({ pressed }) => [styles.left, { opacity: pressed && canSwitch ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Switch child. Currently ${childName}.`}
        >
          <ChildAvatar
            name={childName || avatarInitial}
            id={activeChild?.id}
            colorIndex={childColorIndex(children, activeChild?.id)}
            size={36}
          />
          <View style={styles.namePill}>
            <Text style={styles.childNameLabel} numberOfLines={1}>
              {childName}
            </Text>
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
            accessibilityLabel={hasUnread ? 'Notifications and profile, unread updates' : 'Notifications and profile'}
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
              return (
                <Pressable
                  key={c.id}
                  onPress={() => handleSelect(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={({ pressed }) => [
                    styles.sheetItem,
                    isActive && styles.sheetItemActive,
                    pressed && !isActive && styles.sheetItemPressed,
                  ]}
                >
                  <ChildAvatar name={c.name} id={c.id} colorIndex={childColorIndex(children, c.id)} size={36} />
                  <Text style={[styles.sheetItemName, isActive && styles.sheetItemNameActive]}>
                    {c.name}
                  </Text>
                  {isActive ? <Ionicons name="checkmark-circle" size={20} color={AppColors.secondary} /> : null}
                </Pressable>
              );
            })}
            <Pressable
              onPress={handleAddChild}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            >
              <Ionicons name="add" size={18} color={AppColors.primary} />
              <Text style={styles.addButtonLabel}>Add another child</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  content: {
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
  },
  namePill: {
    flexDirection: 'row',
    alignItems: 'center',
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
    maxWidth: 140,
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
  sheetItemName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: AppColors.onSurface,
    flex: 1,
  },
  sheetItemNameActive: {
    fontFamily: 'Inter_700Bold',
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
  addButtonLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    color: AppColors.primary,
  },
});
