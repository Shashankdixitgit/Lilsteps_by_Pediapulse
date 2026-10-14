import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton, TextButton } from '@/components/gradient-button';
import { confirmAsync, notify } from '@/components/growth/confirm';
import { HeaderIconButton, ScreenHeader } from '@/components/ScreenHeader';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useChild } from '@/context/child';
import {
  DocumentUploadError,
  getDocumentSignedUrl,
  openDocumentFile,
  useDocuments,
} from '@/hooks/useDocuments';
import { formatDate } from '@/lib/date';
import { typography } from '@/styles/global';

const CATEGORY_LABEL: Record<string, string> = {
  prescription: 'Prescription',
  report: 'Medical report',
  lab_test: 'Lab test',
  visit_history: 'Visit history',
  vaccination: 'Vaccination certificate',
  other: 'Document',
};

export default function RecordDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { child } = useChild();
  const { documents, loading, deleteDocument } = useDocuments(child?.id ?? null);

  const doc = documents.find(d => d.id === id);
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Signed URL for the inline image preview (images only; PDFs open via Download).
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const isImage = doc?.file_type === 'image';
  const fileUrl = doc?.file_url;
  const docTitle = doc?.title;
  useEffect(() => {
    if (!isImage || !fileUrl) return;
    let cancelled = false;
    getDocumentSignedUrl({ title: docTitle ?? 'record', file_url: fileUrl })
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isImage, fileUrl, docTitle]);

  // en-IN, like the rest of the app: "13 Oct 2026", "13 Oct 2026 · 4:05 pm".
  const formattedDate = doc ? formatDate(doc.document_date, { year: 'always' }) : '—';

  const formattedUpdated = doc
    ? `${formatDate(doc.created_at, { year: 'always' })} · ${new Date(doc.created_at).toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}`
    : '—';

  const fileSizeLabel = doc?.file_size
    ? doc.file_size > 1024 * 1024
      ? `${(doc.file_size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(doc.file_size / 1024))} KB`
    : null;

  const categoryLabel = doc ? (CATEGORY_LABEL[doc.category] ?? 'Document') : '';

  function showFileError(e: unknown) {
    notify(
      'Could not open file',
      e instanceof DocumentUploadError ? e.message : 'Please check your connection and try again.',
    );
  }

  async function handleDownload() {
    if (!doc || opening) return;
    setOpening(true);
    try {
      await openDocumentFile(doc);
    } catch (e) {
      showFileError(e);
    } finally {
      setOpening(false);
    }
  }

  async function handleDelete() {
    if (!doc || deleting) return;
    const ok = await confirmAsync(
      'Delete this record?',
      `"${doc.title}" and its file will be removed from ${child?.name ? `${child.name}'s` : 'your'} health records. This can't be undone.`,
      { confirmLabel: 'Delete', destructive: true },
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteDocument(doc.id);
      if (router.canGoBack()) router.back();
      else router.replace('/records');
    } catch {
      setDeleting(false);
      notify('Could not delete', 'Please check your connection and try again.');
    }
  }

  // Shares a temporary link (1 hour), never a permanent one: the bucket is private.
  async function handleShare() {
    if (!doc) return;
    let url: string;
    try {
      url = await getDocumentSignedUrl(doc, { expiresIn: 60 * 60 });
    } catch (e) {
      showFileError(e);
      return;
    }
    const message = `${doc.title} (link expires in 1 hour)\n${url}`;
    // Web: most desktop browsers have no share sheet. Copy the link instead
    // of failing with a misleading "could not open file".
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) {
        try {
          await nav.share({ title: doc.title, text: message });
        } catch (e) {
          if ((e as { name?: string })?.name !== 'AbortError') {
            notify('Could not share', 'Please try again, or use Download instead.');
          }
        }
        return;
      }
      try {
        await nav?.clipboard?.writeText(message);
        notify('Link copied', 'A link to this record is on your clipboard. It works for 1 hour.');
      } catch {
        notify('Could not share', 'This browser can\'t share or copy links. Use Download instead.');
      }
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      notify('Could not share', 'Please try again.');
    }
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

        {/* Image preview: tap to open it full size */}
        {isImage && !previewFailed ? (
          <Pressable
            onPress={handleDownload}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${doc.title}. Open full size`}
            style={styles.preview}
          >
            {previewUrl ? (
              <Image
                source={{ uri: previewUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                transition={150}
                onError={() => setPreviewFailed(true)}
              />
            ) : (
              <ActivityIndicator color={AppColors.secondary} />
            )}
          </Pressable>
        ) : null}

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
          <Pressable
            onPress={handleDownload}
            disabled={opening}
            accessibilityRole="button"
            accessibilityLabel="Download file"
            accessibilityState={{ busy: opening, disabled: opening }}
            style={({ pressed }) => [styles.downloadBtn, (pressed || opening) && styles.pressed]}
          >
            {opening ? (
              <ActivityIndicator size="small" color={AppColors.secondary} />
            ) : (
              <Ionicons name="download-outline" size={Size.iconRow} color={AppColors.secondary} />
            )}
            <Text style={styles.downloadText}>Download</Text>
          </Pressable>
        </View>

        <GradientButton
          label="Book follow-up"
          onPress={() => router.push('/consult/booking')}
          style={styles.cta}
        />

        <TextButton
          label={deleting ? 'Deleting…' : 'Delete record'}
          tone="danger"
          onPress={handleDelete}
          disabled={deleting}
          style={styles.deleteBtn}
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
  deleteBtn: { alignSelf: 'center' },
  preview: {
    height: 260,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.card,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },

  notFoundText: { color: AppColors.onSurface },
});
