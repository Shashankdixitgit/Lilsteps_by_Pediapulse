/**
 * Book Consultation — Doctor Listing Screen
 *
 * Real doctors via useDoctors() (filtered to dashboard-registered only).
 * Flow: booking → describe → slots → confirm
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppColors } from '@/constants/theme';
import { useDoctors, type DoctorRow } from '@/hooks/useDoctors';

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
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={AppColors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Consultations</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={AppColors.onSurfaceVariant} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, specialty, or clinic…"
            placeholderTextColor={AppColors.onSurfaceVariant}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={AppColors.onSurfaceVariant} />
            </Pressable>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Available Pediatricians</Text>
          <Text style={styles.docCount}>
            {loading ? '…' : `${filtered.length} ${filtered.length === 1 ? 'doctor' : 'doctors'}`}
          </Text>
        </View>

        <View style={styles.doctorList}>
          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="small" color={AppColors.primary} />
              <Text style={styles.emptyText}>Loading doctors…</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={36} color={AppColors.outlineVariant} />
              <Text style={styles.emptyText}>
                {search
                  ? `No doctors found for "${search}"`
                  : 'No doctors registered yet. Ask the clinic to set up the dashboard.'}
              </Text>
            </View>
          ) : (
            filtered.map((doc) => (
              <DoctorCard key={doc.id} doc={doc} onBook={() => bookDoctor(doc.id)} />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function DoctorCard({ doc, onBook }: { doc: DoctorRow; onBook: () => void }) {
  const initial = doc.name.split(' ').slice(-1)[0]?.charAt(0) ?? doc.name.charAt(0);
  return (
    <View style={styles.doctorCard}>
      <View style={styles.docAvatarWrap}>
        <LinearGradient
          colors={[`${AppColors.primary}30`, `${AppColors.primary}15`]}
          style={styles.docAvatar}
        >
          <Text style={styles.docAvatarInitial}>{initial}</Text>
        </LinearGradient>
      </View>

      <View style={styles.docInfo}>
        <Text style={styles.docRole}>{doc.specialisation.toUpperCase()}</Text>
        <Text style={styles.docName}>{doc.name}</Text>
        <Text style={styles.docSpec}>{doc.hospital}</Text>

        <View style={styles.docActions}>
          <Pressable
            style={({ pressed }) => [styles.bookBtn, { opacity: pressed ? 0.85 : 1 }]}
            onPress={onBook}
          >
            <LinearGradient
              colors={[AppColors.primary, AppColors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bookBtnGrad}
            >
              <Text style={styles.bookBtnText}>Book Now</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderBottomWidth: 1, borderBottomColor: `${AppColors.outlineVariant}20`,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${AppColors.surfaceContainerHigh}80`,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 18, color: AppColors.onSurface, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 20, paddingTop: 20, gap: 20 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: AppColors.surfaceContainerLow, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  searchInput: {
    flex: 1, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14,
    color: AppColors.onSurface,
  },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 18, color: AppColors.onSurface, letterSpacing: -0.3 },
  docCount: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: AppColors.onSurfaceVariant },

  doctorList: { gap: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: AppColors.onSurfaceVariant, textAlign: 'center', maxWidth: 280 },

  doctorCard: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 18,
    flexDirection: 'row', gap: 16, alignItems: 'flex-start',
    shadowColor: AppColors.onSurface, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 3,
  },
  docAvatarWrap: { alignItems: 'center', position: 'relative' },
  docAvatar: {
    width: 72, height: 72, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  docAvatarInitial: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 28, color: AppColors.primary },

  docInfo: { flex: 1, gap: 4 },
  docRole: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, letterSpacing: 0.8, color: AppColors.primary },
  docName: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 15, color: AppColors.onSurface, letterSpacing: -0.2 },
  docSpec: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: AppColors.onSurfaceVariant, lineHeight: 18 },

  docActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  bookBtn: { borderRadius: 999, overflow: 'hidden', flex: 1 },
  bookBtnGrad: { paddingVertical: 12, alignItems: 'center' },
  bookBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: AppColors.onPrimary },
});
