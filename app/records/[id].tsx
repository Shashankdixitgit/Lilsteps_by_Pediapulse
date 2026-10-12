import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton, TextButton } from '@/components/gradient-button';
import { HeaderIconButton, ScreenHeader } from '@/components/ScreenHeader';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useDocuments } from '@/hooks/useDocuments';
import { typography } from '@/styles/global';

const CATEGORY_LABEL: Record<string, string> = {
  prescription: 'Prescription',
  report: 'Medical report',
  lab_test: 'Lab test',
  visit_history: 'Visit history',
  other: 'Document',
};

export default function RecordDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { child } = useChild();
  const { documents, loading } = useDocuments(child?.id ?? null);

  const doc = documents.find(d => d.id === id);

  const formattedDate = doc
    ? new Date(doc.document_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const formattedUpdated = doc
    ? new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' +
      new Date(doc.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : '—';

  const fileSizeLabel = doc?.file_size
    ? doc.file_size > 1024 * 1024
      ? `${(doc.file_size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(doc.file_size / 1024)} KB`
    : null;

  const categoryLabel = doc ? (CATEGORY_LABEL[doc.category] ?? 'Document') : '';

  async function handleShare() {
    if (!doc) return;
    await Share.share({ message: `${doc.title} - ${doc.file_url}` });
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }, styles.centered]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  if (!doc) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader title="Record" />
        <View style={styles.centered}>
          <Text style={[typography.body, styles.notFoundText]}>Record not found</Text>
          <TextButton label="Go back" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const fileLabel = doc.file_type === 'pdf' ? 'PDF file' : 'Image file';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Record"
        right={<HeaderIconButton icon="share-outline" onPress={handleShare} accessibilityLabel="Share record" />}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.category}>{categoryLabel}</Text>
          <Text style={typography.heading}>{doc.title}</Text>
          <Text style={typography.meta}>
            {formattedDate}
            {doc.doctor_name ? ` · ${doc.doctor_name}` : ''}
          </Text>
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={[typography.body, styles.notes]}>
            {doc.notes || 'This document has been stored securely in your health records.'}
          </Text>
          <Text style={typography.caption}>Last updated {formattedUpdated}</Text>
        </View>

        {/* File */}
        <View style={[styles.card, styles.fileRow]}>
          <View style={styles.well}>
            <Ionicons
              name={doc.file_type === 'pdf' ? 'document-text-outline' : 'image-outline'}
              size={Size.iconRow}
              color={AppColors.secondary}
            />
          </View>
          <View style={styles.fileText}>
            <Text style={typography.title} numberOfLines={1}>
              {fileLabel}
            </Text>
            {!!fileSizeLabel && <Text style={typography.meta}>{fileSizeLabel}</Text>}
          </View>
          {/* No download handler is wired yet (unchanged); styled as a text action. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Download file"
            style={({ pressed }) => [styles.downloadBtn, pressed && styles.pressed]}
          >
            <Ionicons name="download-outline" size={Size.iconRow} color={AppColors.secondary} />
            <Text style={styles.downloadText}>Download</Text>
          </Pressable>
        </View>

        <GradientButton
          label="Book follow-up"
          onPress={() => router.push('/consult/booking')}
          style={styles.cta}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },

  titleSection: { gap: 4, marginBottom: 8 },
  category: {
    fontFamily: FontFamily.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.secondary,
  },

  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
    gap: 12,
  },
  notes: { color: AppColors.onSurface },

  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  well: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileText: { flex: 1, gap: 2 },
  downloadBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  pressed: { opacity: 0.6 },
  downloadText: { fontFamily: FontFamily.semibold, fontSize: 15, color: AppColors.secondary },

  cta: { marginTop: 8 },

  notFoundText: { color: AppColors.onSurface },
});
