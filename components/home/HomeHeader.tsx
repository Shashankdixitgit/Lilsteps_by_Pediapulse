import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';
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
          AppColors.surface,
          AppColors.surface,
          `${AppColors.surface}E8`,
          `${AppColors.surface}B0`,
          `${AppColors.surface}60`,
          `${AppColors.surface}20`,
          `${AppColors.surface}00`,
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
          <View style={styles.avatarRing}>
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{avatarInitial}</Text>
            </View>
          </View>
          <View style={styles.namePill}>
            <Text style={styles.childNameLabel} numberOfLines={1}>
              {childName}
            </Text>
            {canSwitch && children.length > 1 && (
              <Ionicons name="chevron-down" size={14} color={AppColors.primary} />
            )}
          </View>
        </Pressable>

        <View style={styles.bellWrapper}>
          <Pressable
            onPress={onNotifications}
            style={({ pressed }) => [styles.bellButton, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Notifications and profile"
          >
            <Ionicons name="notifications-outline" size={20} color={AppColors.primary} />
          </Pressable>
          {hasUnread && <View style={styles.unreadDot} />}
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
            <Text style={styles.sheetEyebrow}>YOUR CHILDREN</Text>
            {children.map((c) => {
              const isActive = c.id === activeChild?.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => handleSelect(c.id)}
                  style={({ pressed }) => [
                    styles.sheetItem,
                    isActive && styles.sheetItemActive,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <View style={styles.sheetAvatar}>
                    <Text style={styles.sheetAvatarInitial}>{c.name.charAt(0)}</Text>
                  </View>
                  <Text style={[styles.sheetItemName, isActive && styles.sheetItemNameActive]}>
                    {c.name}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark" size={18} color={AppColors.primary} />
                  )}
                </Pressable>
              );
            })}
            <Pressable
              onPress={handleAddChild}
              style={({ pressed }) => [styles.addButton, { opacity: pressed ? 0.7 : 1 }]}
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
    paddingBottom: 40,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarRing: {
    padding: 2,
    borderRadius: 24,
    backgroundColor: AppColors.surfaceContainerLowest,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppColors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: AppColors.primary,
  },
  namePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: `${AppColors.surfaceContainerLowest}E0`,
  },
  childNameLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: AppColors.onSurface,
    letterSpacing: -0.2,
    maxWidth: 140,
  },
  bellWrapper: {
    position: 'relative',
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surfaceContainerLowest,
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.tertiary,
    borderWidth: 1.5,
    borderColor: AppColors.surfaceContainerLowest,
    zIndex: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(52, 44, 56, 0.18)',
  },
  sheet: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 24,
    backgroundColor: AppColors.surfaceContainerLowest,
    gap: 6,
    shadowColor: '#342c38',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 12,
  },
  sheetEyebrow: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    letterSpacing: 1.6,
    color: AppColors.onSurfaceVariant,
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
    backgroundColor: AppColors.surfaceContainer,
  },
  sheetAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppColors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetAvatarInitial: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: AppColors.primary,
  },
  sheetItemName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: AppColors.onSurface,
    flex: 1,
  },
  sheetItemNameActive: {
    fontFamily: 'PlusJakartaSans_700Bold',
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
    backgroundColor: AppColors.surfaceContainer,
  },
  addButtonLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: AppColors.primary,
  },
});
