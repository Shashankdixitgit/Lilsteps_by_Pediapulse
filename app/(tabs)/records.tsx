import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, useFocusEffect } from 'expo-router';
import { Menu } from 'heroui-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { TextButton } from '@/components/gradient-button';
import { TabScreenLayout } from '@/components/TabScreenLayout';
import { tabBarRightEdgeCover, tabBarSpace as tabBarSpaceFor } from '@/components/home/tabBarSpace';
import { AppColors, FontFamily, Radius, Shadow, Size, softSurface } from '@/constants/theme';
import { HeaderChildAvatar } from '@/components/HeaderChildAvatar';
import { useChild } from '@/context/child';
import { parentConsultTitle, useConsultations, type ConsultationRow } from '@/hooks/useConsultations';
import { useDocuments, type DocumentRow } from '@/hooks/useDocuments';
import { usePrescriptions, type PrescriptionRow } from '@/hooks/usePrescriptions';
import { formatDate } from '@/lib/date';
import { typography } from '@/styles/global';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'reports', label: 'Reports' },
  { key: 'history', label: 'Visits' },
  { key: 'lab', label: 'Lab tests' },
  { key: 'vaccination', label: 'Vaccination' },
  { key: 'other', label: 'Other' },
] as const;

const ADD_OPTIONS = [
  { key: 'prescription', label: 'Prescription', icon: 'document-text-outline', color: AppColors.primary },
  { key: 'report', label: 'Medical Report', icon: 'analytics-outline', color: AppColors.secondary },
  { key: 'lab_test', label: 'Lab Test', icon: 'flask-outline', color: AppColors.warningAmber },
  { key: 'visit_history', label: 'Visit Record', icon: 'time-outline', color: AppColors.accentBlue },
  { key: 'discharge_summary', label: 'Discharge Summary', icon: 'bed-outline', color: AppColors.accentBlue },
  { key: 'vaccination', label: 'Vaccination Certificate', icon: 'medical-outline', color: AppColors.success },
  { key: 'other', label: 'Other Document', icon: 'folder-outline', color: AppColors.onSurfaceVariant },
] as const;

const CATEGORY_FILTER_MAP: Record<string, DocumentRow['category'] | null> = {
  all: null,
  prescriptions: 'prescription',
  reports: 'report',
  history: 'visit_history',
  lab: 'lab_test',
  vaccination: 'vaccination',
  other: 'other',
};

const CATEGORY_PILL_LABEL: Record<DocumentRow['category'], string> = {
  prescription: 'Prescription',
  report: 'Report',
  lab_test: 'Lab Test',
  visit_history: 'Visit',
  vaccination: 'Vaccination',
  other: 'Document',
};

const CATEGORY_ICON: Record<DocumentRow['category'], keyof typeof Ionicons.glyphMap> = {
  prescription: 'document-text-outline',
  report: 'analytics-outline',
  lab_test: 'flask-outline',
  visit_history: 'time-outline',
  vaccination: 'medical-outline',
  other: 'folder-outline',
};

/** "Add a record" button size. */
const ADD_FAB_SIZE = 52;

export default function RecordsScreen() {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  // The add button sits above whatever the tab bar covers at the right edge
  // (in the compact layout that includes the AI button), and the list ends
  // above both, so the last record is never under either button (R3-19).
  const addFabBottom = tabBarRightEdgeCover(width, insets.bottom, fontScale) + 16;
  const contentBottom = Math.max(
    tabBarSpaceFor(width, insets.bottom, fontScale),
    addFabBottom + ADD_FAB_SIZE + 24 * Math.max(1, fontScale),
  );
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const { child } = useChild();
  const { documents, loading: loadingDocs, refetch: refetchDocs } = useDocuments(child?.id ?? null);
  const {
    prescriptions,
    loading: loadingPrescriptions,
    refetch: refetchPrescriptions,
  } = usePrescriptions(child?.id ?? null);
  // Finished LilSteps consults (written when the doctor closes the visit).
  const {
    consultations,
    loading: loadingConsults,
    refetch: refetchConsults,
  } = useConsultations(child?.id ?? null);

  // Coming back from an upload, a delete, a new prescription or a finished
  // consult: reload, so the list is never stale until the app is reopened.
  useFocusEffect(
    useCallback(() => {
      refetchDocs();
      refetchPrescriptions();
      refetchConsults();
    }, [refetchDocs, refetchPrescriptions, refetchConsults]),
  );

  const showPrescriptions = activeFilter === 'all' || activeFilter === 'prescriptions';
  const showVisits = activeFilter === 'all' || activeFilter === 'history';
  // Spinner only before anything is shown; focus refetches update in place.
  const isLoading =
    (loadingDocs && documents.length === 0) ||
    (showPrescriptions && loadingPrescriptions && prescriptions.length === 0) ||
    (showVisits && loadingConsults && consultations.length === 0);
  // The FAB is hidden while the child has no records at all: the empty state's
  // "Upload first record" button covers the same action.
  const hasAnyRecords = documents.length + prescriptions.length + consultations.length > 0;
  const filteredPrescriptions = useMemo(() => {
    if (!showPrescriptions) return [];
    if (!search.trim()) return prescriptions;
    const q = search.trim().toLowerCase();
    return prescriptions.filter((p) =>
      p.doctors?.name?.toLowerCase().includes(q) ||
      p.prescription_items?.some((i) => i.medicine.toLowerCase().includes(q)),
    );
  }, [prescriptions, search, showPrescriptions]);

  const filteredVisits = useMemo(() => {
    if (!showVisits) return [];
    if (!search.trim()) return consultations;
    const q = search.trim().toLowerCase();
    return consultations.filter((c) =>
      c.doctor_name?.toLowerCase().includes(q) ||
      (c.chief_complaint?.toLowerCase().includes(q) ?? false) ||
      (parentConsultTitle(c)?.toLowerCase().includes(q) ?? false) ||
      (c.outcome?.toLowerCase().includes(q) ?? false),
    );
  }, [consultations, search, showVisits]);

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

  const recordCount = filteredVisits.length + filteredDocs.length + filteredPrescriptions.length;

  return (
    <>
      <TabScreenLayout headerContent={headerContent} scrollContentStyle={{ paddingBottom: contentBottom }}>
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
                  aria-selected={active}
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
            <RecordsEmptyState
              hasAnyRecords={hasAnyRecords}
              searching={search.trim().length > 0}
              filterKey={activeFilter}
            />
          ) : (
            <View style={styles.listCard}>
              {filteredVisits.map((c, i) => (
                <VisitCard
                  key={c.id}
                  consultation={c}
                  divider={i > 0}
                  onPress={() => router.push({ pathname: '/consult/[id]', params: { id: c.id } })}
                />
              ))}
              {filteredPrescriptions.map((p, i) => (
                <PrescriptionCard
                  key={p.id}
                  prescription={p}
                  divider={i > 0 || filteredVisits.length > 0}
                  onPress={() => router.push(`/prescriptions/${p.id}` as any)}
                />
              ))}
              {filteredDocs.map((doc, i) => (
                <RecordCard
                  key={doc.id}
                  doc={doc}
                  divider={i > 0 || filteredPrescriptions.length > 0 || filteredVisits.length > 0}
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
            style={[styles.fab, { bottom: addFabBottom }]}
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
  const formattedDate = formatDate(doc.document_date, { year: 'always' });
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

/** A finished LilSteps consult; opens its visit summary. */
function VisitCard({
  consultation,
  divider,
  onPress,
}: {
  consultation: ConsultationRow;
  divider: boolean;
  onPress: () => void;
}) {
  const date = formatDate(consultation.created_at, { year: 'always' });
  const title = parentConsultTitle(consultation) || 'LilSteps video consult';
  const meta = ['LilSteps visit', date, consultation.doctor_name].filter(Boolean).join(' · ');

  return (
    <RecordRow
      icon="videocam-outline"
      title={title}
      meta={meta}
      note={consultation.outcome}
      divider={divider}
      onPress={onPress}
      accessibilityLabel={`${title}, ${meta}. Open visit summary`}
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
  const issuedDate = formatDate(prescription.issued_at, { year: 'always' });
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

/** Upload category for each filter chip (prescriptions go to 'prescription'). */
const FILTER_UPLOAD: Record<
  string,
  { category: DocumentRow['category']; noun: string; body: string; consultLink?: boolean } | undefined
> = {
  prescriptions: {
    category: 'prescription',
    noun: 'prescriptions',
    body: 'Prescriptions from your LilSteps doctor appear here. You can also add one from another clinic.',
  },
  reports: { category: 'report', noun: 'reports', body: 'Add a medical report so it stays with the other records.' },
  history: {
    category: 'visit_history',
    noun: 'visit records',
    body: 'LilSteps consults show here once finished. Add notes from other clinics too.',
    consultLink: true,
  },
  lab: { category: 'lab_test', noun: 'lab tests', body: 'Add blood or other test results here.' },
  vaccination: {
    category: 'vaccination',
    noun: 'vaccination certificates',
    body: 'Add a photo of the vaccination card or a certificate.',
  },
  other: { category: 'other', noun: 'other documents', body: 'Anything else worth keeping for the doctor.' },
};

function RecordsEmptyState({
  hasAnyRecords,
  searching,
  filterKey,
}: {
  hasAnyRecords: boolean;
  searching: boolean;
  filterKey: string;
}) {
  if (searching) {
    return <EmptyState compact title="No matches" body="Try another word, or clear the search." />;
  }
  const upload = FILTER_UPLOAD[filterKey];
  if (hasAnyRecords && upload) {
    // A category with nothing in it yet: say so and offer to add one, rather
    // than suggesting a search the parent never typed.
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          compact
          title={`No ${upload.noun} yet`}
          body={upload.body}
          actionLabel="Add one"
          onAction={() => router.push({ pathname: '/records/upload', params: { category: upload.category } } as never)}
        />
        {upload.consultLink ? (
          <TextButton
            label="See consults and book a doctor"
            chevron
            onPress={() => router.navigate('/(tabs)/consult')}
          />
        ) : null}
      </View>
    );
  }
  return (
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
  emptyWrap: { gap: 4, alignItems: 'center' },
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
    width: ADD_FAB_SIZE, height: ADD_FAB_SIZE, borderRadius: ADD_FAB_SIZE / 2,
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
