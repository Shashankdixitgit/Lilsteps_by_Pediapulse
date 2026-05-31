import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Card, Menu, Tabs } from 'heroui-native';
import { useMemo, useState } from 'react';
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

import { TabScreenLayout } from '@/components/TabScreenLayout';
import { AppColors } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useDocuments, type DocumentRow } from '@/hooks/useDocuments';
import { usePrescriptions, type PrescriptionRow } from '@/hooks/usePrescriptions';

const CATEGORIES = [
  { key: 'all', label: 'All', icon: 'grid-outline' },
  { key: 'prescriptions', label: 'Prescriptions', icon: 'document-text-outline' },
  { key: 'reports', label: 'Reports', icon: 'analytics-outline' },
  { key: 'history', label: 'Visits', icon: 'time-outline' },
  { key: 'lab', label: 'Lab Tests', icon: 'flask-outline' },
] as const;

const ADD_OPTIONS = [
  { key: 'prescription', label: 'Prescription', icon: 'document-text-outline', color: AppColors.primary },
  { key: 'report', label: 'Medical Report', icon: 'analytics-outline', color: AppColors.secondary },
  { key: 'lab_test', label: 'Lab Test', icon: 'flask-outline', color: AppColors.tertiary },
  { key: 'visit_history', label: 'Visit Record', icon: 'time-outline', color: AppColors.accentBlue },
  { key: 'other', label: 'Other Document', icon: 'folder-outline', color: AppColors.onSurfaceVariant },
] as const;

const CATEGORY_FILTER_MAP: Record<string, DocumentRow['category'] | null> = {
  all: null,
  prescriptions: 'prescription',
  reports: 'report',
  history: 'visit_history',
  lab: 'lab_test',
};

const CATEGORY_PILL_LABEL: Record<DocumentRow['category'], string> = {
  prescription: 'Prescription',
  report: 'Report',
  lab_test: 'Lab Test',
  visit_history: 'Visit',
  other: 'Document',
};

const CATEGORY_PILL_COLOR: Record<DocumentRow['category'], string> = {
  prescription: AppColors.primary,
  report: AppColors.secondary,
  lab_test: AppColors.tertiary,
  visit_history: AppColors.accentBlue,
  other: AppColors.onSurfaceVariant,
};

export default function RecordsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const { child } = useChild();
  const { documents, loading: loadingDocs } = useDocuments(child?.id ?? null);
  const { prescriptions, loading: loadingPrescriptions } = usePrescriptions(child?.id ?? null);
  const childName = child?.name ?? 'Child';

  const showPrescriptions = activeFilter === 'all' || activeFilter === 'prescriptions';
  const filteredPrescriptions = useMemo(() => {
    if (!showPrescriptions) return [];
    if (!search.trim()) return prescriptions;
    const q = search.trim().toLowerCase();
    return prescriptions.filter((p) =>
      p.doctors?.name?.toLowerCase().includes(q) ||
      p.prescription_items?.some((i) => i.medicine.toLowerCase().includes(q)),
    );
  }, [prescriptions, search, showPrescriptions]);

  const filteredDocs = useMemo(() => {
    let docs = documents;
    const categoryFilter = CATEGORY_FILTER_MAP[activeFilter];
    if (categoryFilter) {
      docs = docs.filter(d => d.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      docs = docs.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.doctor_name?.toLowerCase().includes(q) ?? false)
      );
    }
    return docs;
  }, [documents, activeFilter, search]);

  const headerContent = (
    <>
      <View style={styles.headerLeft}>
        <Text style={styles.headerTitle}>Health Records</Text>
        <Text style={styles.headerSub}>{childName}&apos;s medical history</Text>
      </View>
      <Pressable style={styles.headerAvatar} onPress={() => router.push('/profile')}>
        <Text style={styles.headerAvatarText}>{childName.charAt(0)}</Text>
      </Pressable>
    </>
  );

  return (
    <>
      <TabScreenLayout headerContent={headerContent}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={AppColors.outline} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search records, doctors…"
            placeholderTextColor={`${AppColors.onSurfaceVariant}60`}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={AppColors.onSurfaceVariant} />
            </Pressable>
          )}
        </View>

        <Tabs
          value={activeFilter}
          onValueChange={setActiveFilter}
          style={styles.tabsContainer}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScrollContent}
          >
            <Tabs.List style={styles.tabsList}>
              {CATEGORIES.map(cat => (
                <Tabs.Trigger key={cat.key} value={cat.key} style={styles.tabTrigger}>
                  <View style={[
                    styles.tabPill,
                    activeFilter === cat.key && styles.tabPillActive,
                  ]}>
                    <Ionicons
                      name={cat.icon as any}
                      size={16}
                      color={activeFilter === cat.key ? AppColors.onPrimary : AppColors.onSurfaceVariant}
                    />
                    <Text style={[
                      styles.tabLabel,
                      activeFilter === cat.key && styles.tabLabelActive,
                    ]}>
                      {cat.label}
                    </Text>
                  </View>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </ScrollView>
        </Tabs>

        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>
              {activeFilter === 'all' ? 'All Records' : CATEGORIES.find(c => c.key === activeFilter)?.label ?? 'Records'}
            </Text>
            <Text style={styles.countBadge}>{filteredDocs.length + filteredPrescriptions.length}</Text>
          </View>

          {loadingDocs || (showPrescriptions && loadingPrescriptions) ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={AppColors.primary} />
              <Text style={styles.loadingText}>Loading records…</Text>
            </View>
          ) : filteredDocs.length === 0 && filteredPrescriptions.length === 0 ? (
            <EmptyState hasFilter={activeFilter !== 'all' || search.length > 0} />
          ) : (
            <>
              {filteredPrescriptions.map((p) => (
                <PrescriptionCard
                  key={p.id}
                  prescription={p}
                  onPress={() => router.push(`/prescriptions/${p.id}` as any)}
                />
              ))}
              {filteredDocs.map(doc => (
                <RecordCard
                  key={doc.id}
                  doc={doc}
                  onPress={() => router.push(`/records/${doc.id}` as any)}
                />
              ))}
            </>
          )}
        </View>
      </TabScreenLayout>

      <Menu>
        <Menu.Trigger asChild>
          <Pressable style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 80 }]}>
            <LinearGradient
              colors={[AppColors.primary, AppColors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabGrad}
            >
              <Ionicons name="add" size={28} color={AppColors.onPrimary} />
            </LinearGradient>
          </Pressable>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Overlay style={styles.menuOverlay}>
            <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
          </Menu.Overlay>
          <Menu.Content
            presentation="popover"
            placement="top"
            align="end"
            width={190}
            offset={10}
            style={styles.menuContent}
          >
            <Menu.Label style={styles.menuLabel}>Add Record</Menu.Label>
            {ADD_OPTIONS.map((option) => (
              <Menu.Item
                key={option.key}
                style={styles.menuItem}
                onPress={() => router.push({ pathname: '/records/upload', params: { category: option.key } } as any)}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: `${option.color}10` }]}>
                  <Ionicons name={option.icon as any} size={16} color={option.color} />
                </View>
                <Menu.ItemTitle style={styles.menuItemTitle}>{option.label}</Menu.ItemTitle>
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Portal>
      </Menu>
    </>
  );
}

function RecordCard({ doc, onPress }: { doc: DocumentRow; onPress: () => void }) {
  const pillColor = CATEGORY_PILL_COLOR[doc.category] ?? AppColors.primary;
  const pillLabel = CATEGORY_PILL_LABEL[doc.category] ?? 'Document';
  const formattedDate = new Date(doc.document_date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const isPdf = doc.file_type === 'pdf';

  return (
    <Pressable
      style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
      onPress={onPress}
    >
      <Card style={styles.recordCard}>
        <Card.Body style={styles.recordCardBody}>
          <View style={styles.recordTop}>
            <View style={[styles.recordIconWrap, { backgroundColor: `${pillColor}12` }]}>
              <Ionicons
                name={isPdf ? 'document-text' : 'image'}
                size={26}
                color={pillColor}
              />
            </View>

            <View style={styles.recordInfo}>
              <View style={styles.recordTitleRow}>
                <Text style={styles.recordTitle} numberOfLines={1}>{doc.title}</Text>
                <View style={[styles.typeBadge, { backgroundColor: `${pillColor}12` }]}>
                  <Text style={[styles.typeBadgeText, { color: pillColor }]}>
                    {doc.file_type.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.recordMeta}>
                <Ionicons name="calendar-outline" size={12} color={AppColors.onSurfaceVariant} />
                <Text style={styles.recordMetaText}>{formattedDate}</Text>
                {doc.doctor_name && (
                  <>
                    <View style={styles.metaDot} />
                    <Ionicons name="person-outline" size={12} color={AppColors.onSurfaceVariant} />
                    <Text style={styles.recordMetaText} numberOfLines={1}>{doc.doctor_name}</Text>
                  </>
                )}
              </View>
            </View>
          </View>

          <View style={styles.recordBottom}>
            <View style={[styles.catPill, { backgroundColor: `${pillColor}10` }]}>
              <Text style={[styles.catPillText, { color: pillColor }]}>{pillLabel}</Text>
            </View>
            <View style={styles.recordActions}>
              <Pressable style={styles.actionBtn} onPress={onPress}>
                <Ionicons name="eye-outline" size={14} color={AppColors.primary} />
                <Text style={styles.actionBtnText}>View</Text>
              </Pressable>
              <View style={styles.actionDivider} />
              <Pressable style={styles.actionBtn} onPress={onPress}>
                <Ionicons name="arrow-forward" size={14} color={AppColors.onSurfaceVariant} />
              </Pressable>
            </View>
          </View>

          {doc.notes && (
            <Text style={styles.recordNotes} numberOfLines={2}>{doc.notes}</Text>
          )}
        </Card.Body>
      </Card>
    </Pressable>
  );
}

function PrescriptionCard({
  prescription,
  onPress,
}: {
  prescription: PrescriptionRow;
  onPress: () => void;
}) {
  const issuedDate = new Date(prescription.issued_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const itemCount = prescription.prescription_items?.length ?? 0;
  const firstMedicine = prescription.prescription_items?.[0]?.medicine;
  const summary =
    itemCount === 0
      ? 'No items'
      : itemCount === 1
        ? firstMedicine ?? '1 medicine'
        : `${firstMedicine} + ${itemCount - 1} more`;

  return (
    <Pressable
      style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
      onPress={onPress}
    >
      <Card style={styles.recordCard}>
        <Card.Body style={styles.recordCardBody}>
          <View style={styles.recordTop}>
            <View style={[styles.recordIconWrap, { backgroundColor: `${AppColors.primary}12` }]}>
              <Ionicons name="medkit" size={26} color={AppColors.primary} />
            </View>

            <View style={styles.recordInfo}>
              <View style={styles.recordTitleRow}>
                <Text style={styles.recordTitle} numberOfLines={1}>
                  {prescription.doctors?.name ?? 'Doctor'}
                </Text>
                <View style={[styles.typeBadge, { backgroundColor: `${AppColors.primary}12` }]}>
                  <Text style={[styles.typeBadgeText, { color: AppColors.primary }]}>
                    RX
                  </Text>
                </View>
              </View>
              <View style={styles.recordMeta}>
                <Ionicons name="calendar-outline" size={12} color={AppColors.onSurfaceVariant} />
                <Text style={styles.recordMetaText}>{issuedDate}</Text>
                <View style={styles.metaDot} />
                <Ionicons name="medical-outline" size={12} color={AppColors.onSurfaceVariant} />
                <Text style={styles.recordMetaText} numberOfLines={1}>{summary}</Text>
              </View>
            </View>
          </View>

          <View style={styles.recordBottom}>
            <View style={[styles.catPill, { backgroundColor: `${AppColors.primary}10` }]}>
              <Text style={[styles.catPillText, { color: AppColors.primary }]}>Prescription</Text>
            </View>
            <View style={styles.recordActions}>
              <Pressable style={styles.actionBtn} onPress={onPress}>
                <Ionicons name="eye-outline" size={14} color={AppColors.primary} />
                <Text style={styles.actionBtnText}>View</Text>
              </Pressable>
            </View>
          </View>
        </Card.Body>
      </Card>
    </Pressable>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <Card style={styles.emptyCard}>
      <Card.Body style={styles.emptyCardBody}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="folder-open-outline" size={36} color={AppColors.primary} />
        </View>
        <Text style={styles.emptyTitle}>
          {hasFilter ? 'No matching records' : 'No records yet'}
        </Text>
        <Text style={styles.emptyBody}>
          {hasFilter
            ? 'Try clearing the filter or search term.'
            : 'Upload prescriptions, reports, and lab tests to keep everything in one place.'}
        </Text>
        {!hasFilter && (
          <Pressable
            style={styles.emptyBtn}
            onPress={() => router.push('/records/upload')}
          >
            <LinearGradient
              colors={[AppColors.primary, AppColors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.emptyBtnGrad}
            >
              <Ionicons name="cloud-upload-outline" size={16} color={AppColors.onPrimary} />
              <Text style={styles.emptyBtnText}>Upload First Record</Text>
            </LinearGradient>
          </Pressable>
        )}
      </Card.Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerLeft: { gap: 2 },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 22,
    color: AppColors.onSurface, letterSpacing: -0.5,
  },
  headerSub: {
    fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13,
    color: AppColors.onSurfaceVariant,
  },
  headerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: `${AppColors.primaryContainer}55`,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${AppColors.primaryContainer}80`,
  },
  headerAvatarText: {
    fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: AppColors.primary,
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13,
    borderWidth: 1, borderColor: `${AppColors.outlineVariant}20`,
  },
  searchInput: {
    flex: 1, fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14, color: AppColors.onSurface,
  },

  tabsContainer: {
    marginHorizontal: -20,
  },
  tabsScrollContent: {
    paddingHorizontal: 20,
  },
  tabsList: {
    flexDirection: 'row',
    gap: 0,
    backgroundColor: 'transparent',
  },
  tabTrigger: {
    padding: 0,
    margin: 0,
    marginRight: 2,
    backgroundColor: 'transparent',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: AppColors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: `${AppColors.outlineVariant}20`,
  },
  tabPillActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  tabLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: AppColors.onSurfaceVariant,
  },
  tabLabelActive: {
    color: AppColors.onPrimary,
  },

  section: { gap: 14 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 17,
    color: AppColors.onSurface, letterSpacing: -0.3,
  },
  countBadge: {
    fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13,
    color: AppColors.onSurfaceVariant,
    backgroundColor: `${AppColors.primary}12`,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 20 },
  loadingText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, color: AppColors.onSurfaceVariant },

  recordCard: {
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 20,
    borderWidth: 1, borderColor: `${AppColors.outlineVariant}15`,
  },
  recordCardBody: {
    padding: 18,
    gap: 14,
  },
  recordTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  recordIconWrap: {
    width: 50, height: 50, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  recordInfo: { flex: 1, gap: 6 },
  recordTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordTitle: {
    fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15,
    color: AppColors.onSurface, flex: 1,
  },
  typeBadge: {
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  typeBadgeText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 9, letterSpacing: 0.8,
  },
  recordMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  recordMetaText: {
    fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: AppColors.onSurfaceVariant,
  },
  metaDot: {
    width: 3, height: 3, borderRadius: 2,
    backgroundColor: AppColors.outlineVariant,
  },

  recordBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catPill: {
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  catPillText: {
    fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, letterSpacing: 0.3,
  },
  recordActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 6 },
  actionBtnText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: AppColors.primary },
  actionDivider: { width: 1, height: 14, backgroundColor: `${AppColors.outlineVariant}40` },
  recordNotes: {
    fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12,
    color: AppColors.onSurfaceVariant, lineHeight: 18,
    paddingTop: 4, borderTopWidth: 1, borderTopColor: `${AppColors.outlineVariant}15`,
  },

  emptyCard: {
    borderRadius: 20,
    backgroundColor: AppColors.surfaceContainerLowest,
    borderWidth: 1, borderColor: `${AppColors.outlineVariant}15`,
  },
  emptyCardBody: {
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: `${AppColors.primary}10`,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: AppColors.onSurface,
  },
  emptyBody: {
    fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13,
    color: AppColors.onSurfaceVariant, textAlign: 'center', lineHeight: 20,
  },
  emptyBtn: { marginTop: 4, borderRadius: 999, overflow: 'hidden' },
  emptyBtnGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  emptyBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: AppColors.onPrimary,
  },

  fab: {
    position: 'absolute', right: 24, zIndex: 50,
    shadowColor: AppColors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 12,
  },
  fabGrad: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },

  menuOverlay: {
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  menuContent: {
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  menuLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: AppColors.onSurfaceVariant,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  menuItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: AppColors.onSurface,
  },
});
