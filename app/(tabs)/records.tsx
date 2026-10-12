import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { Menu } from 'heroui-native';
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

import { EmptyState } from '@/components/EmptyState';
import { TabScreenLayout } from '@/components/TabScreenLayout';
import { AppColors, FontFamily, Radius, Shadow, Size, softSurface } from '@/constants/theme';
import { HeaderChildAvatar } from '@/components/HeaderChildAvatar';
import { useChild } from '@/context/child';
import { useDocuments, type DocumentRow } from '@/hooks/useDocuments';
import { usePrescriptions, type PrescriptionRow } from '@/hooks/usePrescriptions';
import { typography } from '@/styles/global';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'reports', label: 'Reports' },
  { key: 'history', label: 'Visits' },
  { key: 'lab', label: 'Lab tests' },
] as const;

const ADD_OPTIONS = [
  { key: 'prescription', label: 'Prescription', icon: 'document-text-outline', color: AppColors.primary },
  { key: 'report', label: 'Medical Report', icon: 'analytics-outline', color: AppColors.secondary },
  { key: 'lab_test', label: 'Lab Test', icon: 'flask-outline', color: AppColors.warningAmber },
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

const CATEGORY_ICON: Record<DocumentRow['category'], keyof typeof Ionicons.glyphMap> = {
  prescription: 'document-text-outline',
  report: 'analytics-outline',
  lab_test: 'flask-outline',
  visit_history: 'time-outline',
  other: 'folder-outline',
};

export default function RecordsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const { child } = useChild();
  const { documents, loading: loadingDocs } = useDocuments(child?.id ?? null);
  const { prescriptions, loading: loadingPrescriptions } = usePrescriptions(child?.id ?? null);

  const showPrescriptions = activeFilter === 'all' || activeFilter === 'prescriptions';
  const isLoading = loadingDocs || (showPrescriptions && loadingPrescriptions);
  // The FAB is hidden while the child has no records at all: the empty state's
  // "Upload first record" button covers the same action.
  const hasAnyRecords = documents.length + prescriptions.length > 0;
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
      <Text style={typography.heading}>Health records</Text>
      <HeaderChildAvatar />
    </>
  );

  const recordCount = filteredDocs.length + filteredPrescriptions.length;

  return (
    <>
      <TabScreenLayout headerContent={headerContent}>
        <View style={styles.controls}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={Size.iconRow} color={AppColors.outline} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search records, doctors…"
              placeholderTextColor={AppColors.placeholder}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={Size.iconRow} color={AppColors.onSurfaceVariant} />
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContent}
          >
            {CATEGORIES.map((cat) => {
              const active = activeFilter === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => setActiveFilter(cat.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{cat.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={typography.headingSM}>
              {activeFilter === 'all' ? 'All records' : CATEGORIES.find(c => c.key === activeFilter)?.label ?? 'Records'}
            </Text>
            {!isLoading && recordCount > 0 ? (
              <Text style={typography.meta}>
                {recordCount} {recordCount === 1 ? 'record' : 'records'}
              </Text>
            ) : null}
          </View>

          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={AppColors.primary} />
              <Text style={typography.meta}>Loading records…</Text>
            </View>
          ) : recordCount === 0 ? (
            <RecordsEmptyState hasFilter={activeFilter !== 'all' || search.length > 0} />
          ) : (
            <View style={styles.listCard}>
              {filteredPrescriptions.map((p, i) => (
                <PrescriptionCard
                  key={p.id}
                  prescription={p}
                  divider={i > 0}
                  onPress={() => router.push(`/prescriptions/${p.id}` as any)}
                />
              ))}
              {filteredDocs.map((doc, i) => (
                <RecordCard
                  key={doc.id}
                  doc={doc}
                  divider={i > 0 || filteredPrescriptions.length > 0}
                  onPress={() => router.push(`/records/${doc.id}` as any)}
                />
              ))}
            </View>
          )}
        </View>
      </TabScreenLayout>

      {hasAnyRecords ? (
      <Menu>
        <Menu.Trigger asChild>
          <Pressable
            style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 80 }]}
            accessibilityRole="button"
            accessibilityLabel="Add a record"
          >
            <View style={styles.fabGrad}>
              <Ionicons name="add" size={26} color={AppColors.onPrimary} />
            </View>
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
            <Menu.Label style={styles.menuLabel}>Add a record</Menu.Label>
            {ADD_OPTIONS.map((option) => (
              <Menu.Item
                key={option.key}
                style={styles.menuItem}
                onPress={() => router.push({ pathname: '/records/upload', params: { category: option.key } } as any)}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: softSurface(option.color) }]}>
                  <Ionicons name={option.icon as any} size={16} color={option.color} />
                </View>
                <Menu.ItemTitle style={styles.menuItemTitle}>{option.label}</Menu.ItemTitle>
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Portal>
      </Menu>
      ) : null}
    </>
  );
}

/**
 * One record row inside the shared list card: 36 icon well, title 15 SemiBold,
 * meta 13 muted ("Category · date · Dr Name"), optional 1-line note, chevron.
 * The whole row opens the record.
 */
function RecordRow({
  icon,
  title,
  meta,
  note,
  divider,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  meta: string;
  note?: string | null;
  divider: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <View style={styles.rowWell}>
        <Ionicons name={icon} size={Size.iconRow} color={AppColors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={typography.title} numberOfLines={1}>{title}</Text>
        <Text style={typography.meta} numberOfLines={1}>{meta}</Text>
        {note ? (
          <Text style={typography.meta} numberOfLines={1}>{note}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={AppColors.outline} />
    </Pressable>
  );
}

function RecordCard({ doc, divider, onPress }: { doc: DocumentRow; divider: boolean; onPress: () => void }) {
  const categoryLabel = CATEGORY_PILL_LABEL[doc.category] ?? 'Document';
  const formattedDate = new Date(doc.document_date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const meta = [categoryLabel, formattedDate, doc.doctor_name].filter(Boolean).join(' · ');

  return (
    <RecordRow
      icon={CATEGORY_ICON[doc.category] ?? 'document-text-outline'}
      title={doc.title}
      meta={meta}
      note={doc.notes}
      divider={divider}
      onPress={onPress}
      accessibilityLabel={`${doc.title}, ${meta}`}
    />
  );
}

function PrescriptionCard({
  prescription,
  divider,
  onPress,
}: {
  prescription: PrescriptionRow;
  divider: boolean;
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
  const title = prescription.doctors?.name ?? 'Doctor';
  const meta = `Prescription · ${issuedDate} · ${summary}`;

  return (
    <RecordRow
      icon="medkit-outline"
      title={title}
      meta={meta}
      divider={divider}
      onPress={onPress}
      accessibilityLabel={`${title}, ${meta}`}
    />
  );
}

function RecordsEmptyState({ hasFilter }: { hasFilter: boolean }) {
  return hasFilter ? (
    <EmptyState compact title="No matches" body="Try another word, or clear the filter." />
  ) : (
    <EmptyState
      mood="happy"
      prop="folder-open"
      title="No records yet"
      body="Snap a photo of a report or prescription and we'll keep it safe here."
      actionLabel="Upload first record"
      onAction={() => router.push('/records/upload')}
    />
  );
}

const styles = StyleSheet.create({
  controls: { gap: 12 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 44,
    backgroundColor: AppColors.surfaceContainer,
    borderRadius: Radius.md, paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1, height: '100%', fontFamily: FontFamily.regular,
    fontSize: 15, color: AppColors.onSurface,
    outlineStyle: 'none',
  } as any,

  chipsScroll: { marginHorizontal: -20 },
  chipsContent: { paddingHorizontal: 20, gap: 8 },
  chip: {
    height: Size.buttonSmall,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  chipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  chipLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: AppColors.onSurfaceVariant,
  },
  chipLabelActive: {
    color: AppColors.onPrimary,
  },

  section: { gap: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 20 },

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
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 64,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  rowPressed: { backgroundColor: AppColors.surfaceContainerLow },
  rowWell: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Radius.md,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },

  fab: {
    position: 'absolute', right: 20, zIndex: 50, borderRadius: 26,
    boxShadow: Shadow.raised,
  },
  fabGrad: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.primary,
  },

  menuOverlay: {
    backgroundColor: AppColors.overlay,
  },
  menuContent: {
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  menuLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: AppColors.onSurfaceVariant,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
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
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: AppColors.onSurface,
  },
});
