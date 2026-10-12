/**
 * Book Consultation — Doctor Listing Screen
 *
 * Real doctors via useDoctors() (filtered to dashboard-registered only).
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

import { GradientButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useDoctors, type DoctorRow } from '@/hooks/useDoctors';
import { typography } from '@/styles/global';

export default function BookingScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const { doctors, loading } = useDoctors();

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
      <ScreenHeader title="Book a consultation" />

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
              {filtered.map((doc, i) => (
                <DoctorRowItem key={doc.id} doc={doc} divider={i > 0} onBook={() => bookDoctor(doc.id)} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function DoctorRowItem({ doc, divider, onBook }: { doc: DoctorRow; divider: boolean; onBook: () => void }) {
  const initial = doc.name.split(' ').slice(-1)[0]?.charAt(0) ?? doc.name.charAt(0);
  const meta = [doc.specialisation, doc.hospital].filter(Boolean).join(' · ');
  return (
    <PressableScale
      onPress={onBook}
      scaleTo={0.99}
      bg={AppColors.card}
      bgPressed={AppColors.surfaceContainerLow}
      accessibilityLabel={`${doc.name}, ${meta}. Book`}
      style={[styles.row, divider && styles.divider]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {doc.name}
        </Text>
        {doc.specialisation ? (
          <Text style={typography.meta} numberOfLines={1}>
            {doc.specialisation}
          </Text>
        ) : null}
        {doc.hospital ? (
          <Text style={typography.caption} numberOfLines={1}>
            {doc.hospital}
          </Text>
        ) : null}
      </View>
      <GradientButton label="Book" onPress={onBook} variant="outline" size="sm" />
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
});
