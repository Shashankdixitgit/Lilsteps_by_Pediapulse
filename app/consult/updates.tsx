/**
 * Updates — where the Home bell goes. New doctor replies (unread messages),
 * visit summaries ready after a consult, and prescriptions issued since the
 * parent last looked, for every child. Each item stays here until the parent
 * opens it (R2-22): opening the bell alone marks nothing as seen. A reply
 * clears when its chat is opened (the chat marks it read).
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConversationListItem } from '@/components/consult/ConversationListItem';
import { EmptyState } from '@/components/EmptyState';
import { TextButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, Radius, Size } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useUpdates } from '@/hooks/useUpdates';
import { formatDate } from '@/lib/date';
import { typography } from '@/styles/global';

export default function UpdatesScreen() {
  const insets = useSafeAreaInsets();
  const { children } = useChild();
  const { threads, prescriptions: shownRx, summaries, loading, refetch, markPrescriptionSeen, markSummarySeen } =
    useUpdates();
  const multiChild = children.length > 1;

  // Back from a chat: that thread is read now.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const empty = !loading && threads.length === 0 && shownRx.length === 0 && summaries.length === 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Updates" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {loading && threads.length === 0 && shownRx.length === 0 && summaries.length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={AppColors.primary} />
            <Text style={typography.meta}>Checking for updates…</Text>
          </View>
        ) : null}

        {empty ? (
          <EmptyState
            mood="happy"
            prop="notifications-outline"
            title="You're all caught up"
            body="Doctor replies, visit summaries and new prescriptions will show here."
            actionLabel="See all messages"
            onAction={() => router.navigate('/(tabs)/consult')}
          />
        ) : null}

        {threads.length > 0 ? (
          <View style={styles.section}>
            <Text style={typography.headingSM}>New replies</Text>
            <View style={styles.listCard}>
              {threads.map((t, i) => (
                <ConversationListItem
                  key={t.conversationId}
                  id={t.conversationId}
                  doctorName={t.doctorName}
                  preview={multiChild && t.childName ? `For ${t.childName}: ${t.latest}` : t.latest}
                  lastAt={t.latestAt}
                  unread={t.count}
                  divider={i > 0}
                  onPress={(id) => router.push(`/chat/${id}`)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {summaries.length > 0 ? (
          <View style={styles.section}>
            <Text style={typography.headingSM}>Visit summary ready</Text>
            <View style={styles.listCard}>
              {summaries.map((v, i) => {
                const meta = [v.childName ? `For ${v.childName}` : null, formatDate(v.readyAt)]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <PressableScale
                    key={v.id}
                    onPress={() => {
                      markSummarySeen(v.id);
                      router.push({ pathname: '/consult/[id]', params: { id: v.id } });
                    }}
                    scaleTo={0.99}
                    bg={AppColors.card}
                    bgPressed={AppColors.surfaceContainerLow}
                    accessibilityLabel={`Visit summary ready from ${v.doctorName}, ${meta}`}
                    style={[styles.row, i > 0 && styles.divider]}
                  >
                    <View style={styles.well}>
                      <Ionicons name="document-text-outline" size={Size.iconRow} color={AppColors.primary} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={typography.title}>Visit summary from {v.doctorName}</Text>
                      <Text style={typography.meta}>{meta}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={Size.iconRow} color={AppColors.outlineVariant} />
                  </PressableScale>
                );
              })}
            </View>
          </View>
        ) : null}

        {shownRx.length > 0 ? (
          <View style={styles.section}>
            <Text style={typography.headingSM}>New prescriptions</Text>
            <View style={styles.listCard}>
              {shownRx.map((p, i) => {
                const meta = [p.childName ? `For ${p.childName}` : null, formatDate(p.issuedAt)]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <PressableScale
                    key={p.id}
                    onPress={() => {
                      markPrescriptionSeen(p.id);
                      router.push(`/prescriptions/${p.id}` as never);
                    }}
                    scaleTo={0.99}
                    bg={AppColors.card}
                    bgPressed={AppColors.surfaceContainerLow}
                    accessibilityLabel={`New prescription from ${p.doctorName}, ${meta}`}
                    style={[styles.row, i > 0 && styles.divider]}
                  >
                    <View style={styles.well}>
                      <Ionicons name="medkit-outline" size={Size.iconRow} color={AppColors.primary} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={typography.title} numberOfLines={1}>
                        From {p.doctorName}
                      </Text>
                      <Text style={typography.meta} numberOfLines={1}>
                        {meta}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={Size.iconRow} color={AppColors.outlineVariant} />
                  </PressableScale>
                );
              })}
            </View>
          </View>
        ) : null}

        {!empty && !loading ? (
          <TextButton
            label="See all messages"
            onPress={() => router.navigate('/(tabs)/consult')}
            chevron
            style={styles.allLink}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 20 },
  section: { gap: 8 },
  listCard: {
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
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AppColors.border },
  well: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  allLink: { alignSelf: 'flex-start' },
});
