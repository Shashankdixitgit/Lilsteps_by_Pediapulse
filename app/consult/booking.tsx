/**
 * Book Consultation — Doctor Listing Screen
 *
 * Real doctors via useDoctors() (filtered to dashboard-registered only).
 * "Earliest available" books whichever doctor is free soonest; each doctor
 * row shows that doctor's next free time (useNextFreeSlots, 0030), and says
 * so when the doctor hasn't added a video link yet (has_meet_link, 0035).
 * Flow: booking → describe → slots → confirm
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { doctorInitial, whenLabel } from '@/components/consult/appointmentFormat';
import { BookPill } from '@/components/consult/DoctorCardCompact';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useChild } from '@/context/child';
import { doctorHasVideoLink, useDoctors, type DoctorRow } from '@/hooks/useDoctors';
import { ANY_DOCTOR, useNextFreeSlots, type FreeSlot } from '@/hooks/useEarliestSlots';
import { typography } from '@/styles/global';

export default function BookingScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const { doctors, loading } = useDoctors();
  const { child } = useChild();
  const { earliest, byDoctor, loading: loadingNext } = useNextFreeSlots();

  const filtered = doctors.filter((d) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      d.name.toLowerCase().includes(q) ||
      d.specialisation.toLowerCase().includes(q) ||
      d.hospital.toLowerCase().includes(q)
    );
  });

  function bookDoctor(doctorId: string) {
    router.push(`/consult/describe?doctorId=${doctorId}`);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Book a consultation" subtitle={child?.name ? `For ${child.name}` : undefined} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={Size.iconRow} color={AppColors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, specialty or clinic"
            placeholderTextColor={AppColors.placeholder}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={AppColors.muted} />
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={typography.headingSM}>Pediatricians</Text>
            <Text style={typography.caption}>
              {loading ? '…' : `${filtered.length} ${filtered.length === 1 ? 'doctor' : 'doctors'}`}
            </Text>
          </View>

          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="small" color={AppColors.primary} />
              <Text style={typography.meta}>Loading doctors…</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[typography.meta, styles.center]}>
                {search
                  ? `No doctors found for "${search}"`
                  : 'No doctors registered yet. Ask the clinic to set up the dashboard.'}
              </Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {!search && (
                <EarliestRow
                  earliest={earliest}
                  loading={loadingNext}
                  onBook={() => bookDoctor(ANY_DOCTOR)}
                />
              )}
              {filtered.map((doc, i) => (
                <DoctorRowItem
                  key={doc.id}
                  doc={doc}
                  next={byDoctor.get(doc.id) ?? null}
                  nextLoading={loadingNext}
                  divider={i > 0 || !search}
                  onBook={() => bookDoctor(doc.id)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const NO_LINK_HINT = 'Video link not set yet. You can message the doctor.';

/** "Next free: Today, 14 Oct · 5:00 PM", or why there is none. */
function nextFreeText(next: FreeSlot | null, loading: boolean): string | null {
  if (next) return `Next free: ${whenLabel(next.date, next.time)}`;
  return loading ? null : 'No free times in the next 2 weeks';
}

/** First row: book whichever doctor is free soonest. */
function EarliestRow({
  earliest,
  loading,
  onBook,
}: {
  earliest: FreeSlot | null;
  loading: boolean;
  onBook: () => void;
}) {
  const sub = earliest
    ? `${whenLabel(earliest.date, earliest.time)} with ${earliest.doctor_name}`
    : loading
      ? 'Finding the soonest time…'
      : 'No free times in the next 2 weeks';
  return (
    <PressableScale
      onPress={onBook}
      disabled={!loading && !earliest}
      scaleTo={0.99}
      bg={AppColors.card}
      bgPressed={AppColors.surfaceContainerLow}
      accessibilityLabel={`Earliest available doctor. ${sub}. Book`}
      style={styles.row}
    >
      <View style={styles.avatar}>
        <Ionicons name="flash-outline" size={Size.iconRow} color={AppColors.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          Earliest available doctor
        </Text>
        <Text style={typography.meta} numberOfLines={2}>
          {sub}
        </Text>
      </View>
      {earliest ? <BookPill /> : null}
    </PressableScale>
  );
}

function DoctorRowItem({
  doc,
  next,
  nextLoading,
  divider,
  onBook,
}: {
  doc: DoctorRow;
  next: FreeSlot | null;
  nextLoading: boolean;
  divider: boolean;
  onBook: () => void;
}) {
  const initial = doctorInitial(doc.name);
  const meta = [doc.specialisation, doc.hospital].filter(Boolean).join(' · ');
  const nextText = nextFreeText(next, nextLoading);
  const noVideoLink = !doctorHasVideoLink(doc);
  return (
    <PressableScale
      onPress={onBook}
      scaleTo={0.99}
      bg={AppColors.card}
      bgPressed={AppColors.surfaceContainerLow}
      accessibilityLabel={`${doc.name}, ${meta}${nextText ? `. ${nextText}` : ''}${noVideoLink ? `. ${NO_LINK_HINT}` : ''}. Book`}
      style={[styles.row, divider && styles.divider]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {doc.name}
        </Text>
        {meta ? (
          <Text style={typography.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {nextText ? (
          <Text style={[typography.caption, next && styles.nextFree]} numberOfLines={1}>
            {nextText}
          </Text>
        ) : null}
        {noVideoLink ? (
          <View style={styles.noLinkRow}>
            <Ionicons name="videocam-off-outline" size={Size.iconMeta} color={AppColors.muted} />
            <Text style={typography.caption}>{NO_LINK_HINT}</Text>
          </View>
        ) : null}
      </View>
      <BookPill />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    backgroundColor: AppColors.surfaceContainer,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: AppColors.onSurface,
    ...(Platform.OS === 'web' ? { outlineStyle: 'solid' as const, outlineWidth: 0 } : null),
  },

  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },

  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  center: { textAlign: 'center', maxWidth: 280 },

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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FontFamily.semibold, fontSize: 15, color: AppColors.primary },
  info: { flex: 1, gap: 2 },
  name: { ...typography.title, lineHeight: 20 },
  nextFree: { color: AppColors.primary },
  noLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
