import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { HeroCard } from '@/components/ui/HeroCard';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useChild } from '@/context/child';
import { layout, typography } from '@/styles/global';

const QUICK_LINKS = [
  { key: 'records', label: 'Health records', icon: 'folder-outline', route: '/(tabs)/records' },
  { key: 'health-log', label: 'Health log', icon: 'heart-outline', route: '/health-log' },
  { key: 'checkin', label: 'AI health check-in', icon: 'sparkles-outline', route: '/checkin' },
  { key: 'consult', label: 'Book a consultation', icon: 'calendar-outline', route: '/consult/booking' },
] as const;

const SETTINGS_ITEMS = [
  { key: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
  { key: 'privacy', label: 'Privacy & security', icon: 'shield-checkmark-outline' },
  { key: 'help', label: 'Help & support', icon: 'help-circle-outline' },
] as const;

type IconName = keyof typeof Ionicons.glyphMap;

/** One list row: 36 icon well, 15 SemiBold title, optional value / detail, chevron. */
function Row({
  icon,
  title,
  value,
  detail,
  onPress,
  chevron,
  tone = 'default',
  divider,
}: {
  icon: IconName;
  title: string;
  /** Short value on the right (13 muted, 1 line). */
  value?: string;
  /** Data line under the title (e.g. allergy names). */
  detail?: string;
  onPress?: () => void;
  chevron?: boolean;
  tone?: 'default' | 'warning' | 'danger' | 'neutral';
  divider?: boolean;
}) {
  const well =
    tone === 'warning'
      ? { bg: AppColors.warningSurface, fg: AppColors.warning }
      : tone === 'danger'
        ? { bg: AppColors.dangerSurface, fg: AppColors.danger }
        : tone === 'neutral'
          ? { bg: AppColors.surfaceContainer, fg: AppColors.onSurfaceVariant }
          : { bg: AppColors.mintSurface, fg: AppColors.secondary };
  const content: ReactNode = (
    <>
      <View style={[styles.well, { backgroundColor: well.bg }]}>
        <Ionicons name={icon} size={Size.iconRow} color={well.fg} />
      </View>
      <View style={value ? styles.rowTextFixed : styles.rowTextFlex}>
        <Text style={typography.title} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text style={typography.meta} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[typography.meta, styles.rowValue]} numberOfLines={1} ellipsizeMode="middle">
          {value}
        </Text>
      ) : null}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={AppColors.outlineVariant} /> : null}
    </>
  );
  return (
    <View>
      {onPress || chevron ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.row}>{content}</View>
      )}
      {divider ? <View style={styles.divider} /> : null}
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { child, children, age, parentName, selectChild } = useChild();

  const childName = child?.name ?? 'Child';
  // First user-visible character, emoji-safe ("🍼 Baby" -> "🍼", not half a
  // surrogate pair that renders as "?").
  const firstChar = (name: string) => Array.from(name.trim())[0] ?? '';
  const allergies = child?.allergies.map(a => a.name) ?? [];
  const conditions = child?.conditions.map(c => c.name) ?? [];

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/');
        },
      },
    ]);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Profile" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <HeroCard style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{firstChar(childName)}</Text>
          </View>
          <View style={styles.heroText}>
            <Text style={typography.heading} numberOfLines={1}>
              {childName}
            </Text>
            <Text style={[typography.bodySM, styles.heroMeta]} numberOfLines={1}>
              {age}
              {child?.weight || child?.height
                ? ` · ${child?.weight ?? '—'} kg · ${child?.height ?? '—'} cm`
                : ''}
            </Text>
          </View>
        </HeroCard>

        <View style={layout.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.card}>
            <Row icon="person-outline" title="Parent" value={parentName || 'Not set'} divider />
            <Row icon="mail-outline" title="Email" value={user?.email ?? '—'} />
          </View>
        </View>

        {children.length > 1 && (
          <View style={layout.section}>
            <Text style={styles.sectionLabel}>Switch child</Text>
            <View style={styles.childList}>
              {children.map((c) => {
                const active = c.id === child?.id;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.childChip, active && styles.childChipActive]}
                    onPress={() => selectChild(c.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <View style={[styles.childChipAvatar, active && styles.childChipAvatarActive]}>
                      <Text style={[styles.childChipInitial, active && styles.childChipInitialActive]}>
                        {firstChar(c.name)}
                      </Text>
                    </View>
                    <Text style={[styles.childChipName, active && styles.childChipNameActive]}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {(allergies.length > 0 || conditions.length > 0) && (
          <View style={layout.section}>
            <Text style={styles.sectionLabel}>Health info</Text>
            <View style={styles.card}>
              {allergies.length > 0 && (
                <Row
                  icon="warning-outline"
                  tone="warning"
                  title="Allergies"
                  detail={allergies.join(', ')}
                  divider={conditions.length > 0}
                />
              )}
              {conditions.length > 0 && (
                <Row icon="medical-outline" tone="danger" title="Chronic conditions" detail={conditions.join(', ')} />
              )}
            </View>
          </View>
        )}

        <View style={layout.section}>
          <Text style={styles.sectionLabel}>Quick links</Text>
          <View style={styles.card}>
            {QUICK_LINKS.map((item, index) => (
              <Row
                key={item.key}
                icon={item.icon}
                title={item.label}
                chevron
                onPress={() => router.push(item.route as any)}
                divider={index < QUICK_LINKS.length - 1}
              />
            ))}
          </View>
        </View>

        <View style={layout.section}>
          <Text style={styles.sectionLabel}>Settings</Text>
          <View style={styles.card}>
            {SETTINGS_ITEMS.map((item, index) => (
              <Row
                key={item.key}
                icon={item.icon}
                tone="neutral"
                title={item.label}
                chevron
                divider={index < SETTINGS_ITEMS.length - 1}
              />
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <TextButton label="Sign out" tone="danger" onPress={handleSignOut} />
          <Text style={[typography.caption, styles.version]}>LilSteps v1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },

  hero: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  // Avatar keeps the deep-green fill (small solid element, not a card).
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    color: AppColors.onPrimary,
  },
  heroText: { flex: 1, gap: 2 },
  heroMeta: { color: AppColors.secondary, fontFamily: FontFamily.medium },

  sectionLabel: {
    ...typography.sectionLabel,
    color: AppColors.muted,
    marginLeft: 4,
  },

  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rowPressed: { backgroundColor: AppColors.surfaceContainerLow },
  well: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextFixed: { flexShrink: 0, gap: 2 },
  rowTextFlex: { flex: 1, gap: 2 },
  rowValue: { flex: 1, minWidth: 0, textAlign: 'right' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.border,
    marginLeft: 16 + Size.iconWell + 12,
  },

  childList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  childChipActive: {
    borderColor: AppColors.mintBorder,
    backgroundColor: AppColors.mintSurface,
  },
  childChipAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childChipAvatarActive: { backgroundColor: AppColors.primary },
  childChipInitial: { fontFamily: FontFamily.bold, fontSize: 13, color: AppColors.secondary },
  childChipInitialActive: { color: AppColors.onPrimary },
  childChipName: { fontFamily: FontFamily.medium, fontSize: 13, color: AppColors.onSurface },
  childChipNameActive: { fontFamily: FontFamily.semibold, color: AppColors.primary },

  footer: { alignItems: 'center', gap: 4 },
  version: { textAlign: 'center' },
});
