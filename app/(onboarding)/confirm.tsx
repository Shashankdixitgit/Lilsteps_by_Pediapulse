import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChildAvatar } from '@/components/ChildAvatar';
import { GradientButton } from '@/components/gradient-button';
import { AppColors, Radius } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { dbg } from '@/lib/debug';
import { typography } from '@/styles/global';

function getAge(dob: Date): string {
  const now = new Date();
  const totalMonths =
    (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
  if (totalMonths < 1) return 'Newborn';
  if (totalMonths < 12) return `${totalMonths} month${totalMonths !== 1 ? 's' : ''} old`;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (months === 0) return `${years} year${years !== 1 ? 's' : ''} old`;
  return `${years}y ${months}m old`;
}

export default function ConfirmScreen() {
  const insets = useSafeAreaInsets();
  const {
    childName, childSex, dob, weight, height, bloodGroup,
    allergies, conditions, vaccinationsGiven,
  } = useOnboarding();
  const { user, refreshHasChildren } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = childName || 'Your child';
  const initial = displayName.charAt(0).toUpperCase();
  const age = dob ? getAge(dob) : null;
  const sexLabel = childSex === 'male' ? 'Male' : childSex === 'female' ? 'Female' : null;

  const hasAllergies = allergies.length > 0;
  const hasConditions = conditions.length > 0;

  async function handleConfirm() {
    if (!agreed || !user || !dob || !childSex) {
      dbg.db('Confirm: guard failed', { agreed, hasUser: !!user, hasDob: !!dob, childSex });
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // First ensure parent row exists
      dbg.db('Confirm: ensuring parent row', { userId: user.id });
      const { error: parentErr } = await supabase
        .from('parents')
        .upsert({ id: user.id, email: user.email }, { onConflict: 'id' });

      if (parentErr) {
        dbg.dbError('Confirm: parent upsert failed', parentErr);
        // Continue anyway — row might already exist
      }

      // Insert child
      const now = new Date().toISOString();
      const parsedWeight = weight ? parseFloat(weight) : null;
      const parsedHeight = height ? parseFloat(height) : null;
      const childPayload = {
        parent_id: user.id,
        name: childName.trim(),
        dob: dob.toISOString().split('T')[0],
        sex: childSex,
        blood_group: bloodGroup || null,
        weight: parsedWeight,
        height: parsedHeight,
        weight_updated_at: parsedWeight != null ? now : null,
        height_updated_at: parsedHeight != null ? now : null,
      };
      dbg.db('Confirm: inserting child', childPayload);

      const { data: child, error: childErr } = await supabase
        .from('children')
        .insert(childPayload)
        .select()
        .single();

      if (childErr) {
        dbg.dbError('Confirm: child insert failed', childErr);
        throw new Error(childErr.message);
      }
      dbg.db('Confirm: child created', { childId: child.id });

      // Insert allergies and conditions in parallel
      const promises: PromiseLike<unknown>[] = [];

      if (allergies.length > 0) {
        dbg.db('Confirm: inserting allergies', { count: allergies.length });
        promises.push(
          supabase.from('allergies').insert(
            allergies.map(a => ({
              child_id: child.id,
              type: 'food' as const,
              name: a,
              severity: 'mild',
            }))
          )
        );
      }

      if (conditions.length > 0) {
        dbg.db('Confirm: inserting conditions', { count: conditions.length });
        promises.push(
          supabase.from('conditions').insert(
            conditions.map(c => ({
              child_id: child.id,
              name: c,
            }))
          )
        );
      }

      await Promise.all(promises);
      dbg.db('Confirm: all related data saved');

      // Mark vaccines the parent reported as already-given. The trigger on
      // public.children has already populated 38 IAP-schedule rows for this
      // child by now; we just flip those that match the canonical names AND
      // whose scheduled_date is in the past (i.e. were due before today).
      if (vaccinationsGiven.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        dbg.db('Confirm: marking vaccinations done', {
          count: vaccinationsGiven.length,
          names: vaccinationsGiven,
        });
        const { error: vaxErr, count } = await supabase
          .from('vaccinations')
          .update({ status: 'done', administered_date: today }, { count: 'exact' })
          .eq('child_id', child.id)
          .in('vaccine_name', vaccinationsGiven)
          .lte('scheduled_date', today);
        if (vaxErr) dbg.dbError('Confirm: vaccine update failed', vaxErr);
        else dbg.db('Confirm: vaccines marked done', { count });
      }

      // Refresh auth context so it knows we have children now
      await refreshHasChildren();
      dbg.db('Confirm: hasChildren refreshed');

      router.replace('/(onboarding)/complete');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(500)}>
          <Text style={typography.heading}>{childName ? `Check ${childName}'s profile` : 'Check the profile'}</Text>
        </Animated.View>

        {/* Child profile card */}
        <Animated.View entering={FadeInUp.delay(150).duration(600)} style={styles.card}>
          {/* Avatar + identity */}
          <View style={styles.identity}>
            <ChildAvatar name={displayName || initial} size={56} colorIndex={0} />
            <View style={styles.identityText}>
              <Text style={typography.heading} numberOfLines={1}>{displayName}</Text>
              {!!(age || sexLabel) && (
                <Text style={typography.meta}>
                  {[age, sexLabel].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={typography.caption}>Weight</Text>
              <Text style={styles.statValue}>{weight ? `${weight} kg` : '—'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={[styles.statBox, styles.statBoxRight]}>
              <Text style={typography.caption}>Blood group</Text>
              <Text style={styles.statValue}>{bloodGroup || '—'}</Text>
            </View>
          </View>

          {/* Allergies: safety info keeps colour + icon + label */}
          {hasAllergies && (
            <>
              <View style={styles.divider} />
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="alert-circle" size={14} color={AppColors.danger} />
                  <Text style={styles.allergyTitle}>Allergy alert</Text>
                </View>
                <Text style={styles.allergyText}>{allergies.join(', ')}</Text>
              </View>
            </>
          )}

          {/* Conditions */}
          {hasConditions && (
            <>
              <View style={styles.divider} />
              <View style={styles.section}>
                <Text style={typography.caption}>Chronic conditions</Text>
                <Text style={styles.conditionText}>{conditions.join(', ')}</Text>
              </View>
            </>
          )}

          {/* No flags message */}
          {!hasAllergies && !hasConditions && (
            <>
              <View style={styles.divider} />
              <Text style={typography.meta}>No known allergies or chronic conditions</Text>
            </>
          )}
        </Animated.View>

      </ScrollView>

      {/* Footer: consent + the one primary, pinned to the bottom */}
      <Animated.View
        entering={FadeInUp.delay(400).duration(500)}
        style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}
      >
        {error ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Pressable
          style={styles.checkboxRow}
          onPress={() => setAgreed((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          hitSlop={8}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed ? <Ionicons name="checkmark" size={15} color={AppColors.onPrimary} /> : null}
          </View>
          <Text style={styles.checkboxLabel}>
            All details are accurate to the best of my knowledge
          </Text>
        </Pressable>

        {saving ? (
          <View style={styles.loadingCta}>
            <ActivityIndicator color={AppColors.primary} />
            <Text style={styles.loadingText}>Saving profile...</Text>
          </View>
        ) : (
          <GradientButton
            label={`${displayName} is ready. Let's go.`}
            onPress={handleConfirm}
            disabled={!agreed}
          />
        )}

        <Text style={styles.termsText}>
          By continuing you agree to our{' '}
          <Text style={styles.termsLink}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AppColors.surface,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 24,
  },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    padding: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.border,
    marginVertical: 12,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statBox: {
    flex: 1,
    gap: 2,
  },
  statBoxRight: {
    paddingLeft: 16,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.border,
  },
  statValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
    color: AppColors.forestDeep,
  },
  section: {
    gap: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  allergyTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.danger,
  },
  allergyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.danger,
  },
  conditionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: AppColors.danger,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
    backgroundColor: AppColors.surface,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: AppColors.fieldBorder,
    backgroundColor: AppColors.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  checkboxLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
    color: AppColors.onSurface,
    flex: 1,
  },
  termsText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.muted,
    textAlign: 'center',
  },
  termsLink: {
    color: AppColors.secondary,
    fontFamily: 'Inter_600SemiBold',
  },
  loadingCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 48,
  },
  loadingText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: AppColors.secondary,
  },
});
