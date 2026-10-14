import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChildAvatar, childColorIndex } from '@/components/ChildAvatar';
import { TextButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsCard, SettingsRow as Row } from '@/components/settings-row';
import { HeroCard } from '@/components/ui/HeroCard';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useChild } from '@/context/child';
import { clearOnboardingDraft } from '@/context/onboarding';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { confirmAsync } from '@/lib/confirm';
import { EMPTY_PARENT_EXTRAS, fetchParentExtras, relationshipLabel } from '@/lib/parentProfile';
import { formatPhone } from '@/lib/phone';
import { layout, typography } from '@/styles/global';

const DEMO_EMAIL_DOMAIN = '@demo.lilsteps.dev';

const QUICK_LINKS = [
  { key: 'records', label: 'Health records', icon: 'folder-outline', route: '/(tabs)/records' },
  { key: 'health-log', label: 'Health log', icon: 'heart-outline', route: '/health-log' },
  { key: 'checkin', label: 'AI health check-in', icon: 'sparkles-outline', route: '/checkin' },
  { key: 'consult', label: 'Book a consultation', icon: 'calendar-outline', route: '/consult/booking' },
] as const;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { child, children, age, parentName, selectChild } = useChild();
  const notifications = useNotificationPermission();
  // City, language and relationship (R2-13). Reloaded on focus so edits
  // made on Profile > Your details show straight away.
  const [extras, setExtras] = useState(EMPTY_PARENT_EXTRAS);
  const userId = user?.id;
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true;
      void fetchParentExtras(userId).then((x) => {
        if (active) setExtras(x);
      });
      return () => {
        active = false;
      };
    }, [userId]),
  );
  const parentTitle = relationshipLabel(extras.relationship);
  const notificationsOn = notifications.status === 'granted';
  const notificationsDetail =
    notifications.status === 'unsupported'
      ? 'Available in the LilSteps phone app'
      : notificationsOn
        ? 'Consult reminders, doctor replies, vaccines due'
        : 'Off. Turn on to get consult and vaccine reminders';

  const childName = child?.name ?? 'Child';
  // 200% zoom / narrow phone: avatar above the name, so the name and the
  // age line get the full card width instead of "Kav ya" / "kg · …" (R3-05).
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const stackHero = fontScale >= 1.3 || windowWidth / Math.max(fontScale, 1) < 340;
  // First user-visible character, emoji-safe ("🍼 Baby" -> "🍼", not half a
  // surrogate pair that renders as "?").
  const allergies = child?.allergies.map(a => a.name) ?? [];
  // Onboarding "Not known yet" (children.allergies_not_known, 0028). Read
  // defensively: the column may not be on the cached row yet.
  const allergiesNotKnown = (child as { allergies_not_known?: boolean } | null)?.allergies_not_known === true;
  const conditions = child?.conditions.map(c => c.name) ?? [];
  const medications =
    child?.medications.map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(' · ')) ?? [];

  // Phone is how parents sign in. The test-login email
  // (phone-…@demo.lilsteps.dev) is internal and never shown.
  const phone = formatPhone(user?.phone || (user?.user_metadata?.phone as string | undefined) || '');
  const email = user?.email && !user.email.endsWith(DEMO_EMAIL_DOMAIN) ? user.email : null;

  async function doSignOut() {
    // A half-finished onboarding draft (e.g. a second child) must not carry
    // over to the next sign-in on this device.
    if (user) await clearOnboardingDraft(user.id);
    await signOut();
    router.replace('/');
  }

  async function handleSignOut() {
    // Native Alert on iOS/Android, an in-app dialog on web.
    const ok = await confirmAsync('Sign out?', 'Are you sure you want to sign out of LilSteps?', {
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (ok) await doSignOut();
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Profile" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <HeroCard style={[styles.hero, stackHero && styles.heroStacked]}>
          <ChildAvatar
            name={childName}
            id={child?.id}
            colorIndex={childColorIndex(children, child?.id)}
            size={56}
          />
          <View style={styles.heroText}>
            <Text style={typography.heading} numberOfLines={2}>
              {childName}
            </Text>
            <Text style={[typography.bodySM, styles.heroMeta]}>
              {age}
              {child?.weight || child?.height
                ? ` · ${child?.weight ?? '—'} kg · ${child?.height ?? '—'} cm`
                : ''}
            </Text>
          </View>
        </HeroCard>

        <View style={layout.section}>
          <Text style={styles.sectionLabel}>Account</Text>
          <SettingsCard>
            <Row
              icon="person-outline"
              title={parentTitle}
              value={parentName || 'Add your name'}
              chevron
              onPress={() => router.push('/profile/edit-parent')}
              accessibilityLabel={`${parentTitle}, ${parentName || 'name not set'}. Edit your details`}
              divider
            />
            <Row
              icon="location-outline"
              tone="neutral"
              title="City"
              value={extras.city || 'Not set'}
              chevron
              onPress={() => router.push('/profile/edit-parent')}
              accessibilityLabel={`City, ${extras.city || 'not set'}. Edit your details`}
              divider
            />
            <Row
              icon="language-outline"
              tone="neutral"
              title="Preferred language"
              value={extras.preferredLanguage || 'Not set'}
              chevron
              onPress={() => router.push('/profile/edit-parent')}
              accessibilityLabel={`Preferred language, ${extras.preferredLanguage || 'not set'}. Edit your details`}
              divider={!!phone || !!email}
            />
            {phone ? <Row icon="call-outline" title="Phone" value={phone} divider={!!email} /> : null}
            {email ? <Row icon="mail-outline" title="Email" value={email} /> : null}
          </SettingsCard>
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
                    accessibilityState={{ checked: active }}
                    aria-checked={active}
                  >
                    <ChildAvatar name={c.name} id={c.id} colorIndex={childColorIndex(children, c.id)} size={28} />
                    <Text style={[styles.childChipName, active && styles.childChipNameActive]}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {child ? (
          <View style={layout.section}>
            <Text style={styles.sectionLabel}>{`${childName}'s health info`}</Text>
            <SettingsCard>
              <Row
                icon="warning-outline"
                tone={allergies.length > 0 ? 'warning' : 'neutral'}
                title="Allergies"
                detail={allergies.length > 0 ? allergies.join(', ') : allergiesNotKnown ? 'Not known yet' : 'None recorded'}
                divider
              />
              <Row
                icon="medical-outline"
                tone={conditions.length > 0 ? 'danger' : 'neutral'}
                title="Chronic conditions"
                detail={conditions.length > 0 ? conditions.join(', ') : 'None recorded'}
                divider
              />
              <Row
                icon="medkit-outline"
                tone="neutral"
                title="Regular medicines"
                detail={medications.length > 0 ? medications.join(', ') : 'None recorded'}
                divider
              />
              <Row
                icon="create-outline"
                title={`Edit ${childName}'s details`}
                chevron
                onPress={() => router.push({ pathname: '/profile/edit-child', params: { id: child.id } })}
              />
            </SettingsCard>
          </View>
        ) : null}

        <View style={layout.section}>
          <Text style={styles.sectionLabel}>Quick links</Text>
          <SettingsCard>
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
          </SettingsCard>
        </View>

        <View style={layout.section}>
          <Text style={styles.sectionLabel}>Settings</Text>
          <SettingsCard>
            <Row
              icon="notifications-outline"
              tone="neutral"
              title="Notifications"
              detail={notificationsDetail}
              divider
              right={
                notifications.status === 'unsupported' ? null : (
                  <Switch
                    value={notificationsOn}
                    disabled={notifications.status === 'loading'}
                    onValueChange={(next) => void notifications.setEnabled(next)}
                    trackColor={{ false: AppColors.surfaceContainer, true: AppColors.primary }}
                    thumbColor={Platform.OS === 'android' ? AppColors.card : undefined}
                    ios_backgroundColor={AppColors.surfaceContainer}
                    accessibilityLabel="Notifications"
                  />
                )
              }
            />
            <Row
              icon="shield-checkmark-outline"
              tone="neutral"
              title="Privacy & security"
              chevron
              onPress={() => router.push('/profile/privacy')}
              divider
            />
            <Row
              icon="document-text-outline"
              tone="neutral"
              title="Terms of Service"
              chevron
              onPress={() => router.push('/profile/terms')}
              divider
            />
            <Row
              icon="help-circle-outline"
              tone="neutral"
              title="Help & support"
              chevron
              onPress={() => router.push('/profile/help')}
              divider
            />
            {/* App Store 5.1.1(v): account deletion is easy to find (R2-22).
                The form itself is at the end of Privacy & security. */}
            <Row
              icon="trash-outline"
              tone="danger"
              title="Delete account"
              detail="Deletes your account and your children’s data"
              chevron
              onPress={() => router.push({ pathname: '/profile/privacy', params: { section: 'delete' } })}
              accessibilityHint="Opens Privacy & security, where you can delete your account"
            />
          </SettingsCard>
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
  heroStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 12 },
  heroText: { flex: 1, minWidth: 0, gap: 2, alignSelf: 'stretch' },
  heroMeta: { color: AppColors.secondary, fontFamily: FontFamily.medium },

  sectionLabel: {
    ...typography.sectionLabel,
    color: AppColors.muted,
    marginLeft: 4,
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
  childChipName: { fontFamily: FontFamily.medium, fontSize: 13, color: AppColors.onSurface },
  childChipNameActive: { fontFamily: FontFamily.semibold, color: AppColors.primary },

  footer: { alignItems: 'center', gap: 4 },
  version: { textAlign: 'center' },
});
