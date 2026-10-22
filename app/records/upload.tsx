import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/chip-group';
import { GradientButton } from '@/components/gradient-button';
import { notify } from '@/components/growth/confirm';
import { DateField } from '@/components/growth/DateField';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useChild } from '@/context/child';
import {
  DocumentUploadError,
  MAX_DOCUMENT_BYTES,
  useDocuments,
  type DocumentRow,
} from '@/hooks/useDocuments';
import { istTodayDateOnly } from '@/hooks/useGrowth';
import { typography } from '@/styles/global';
import { WEB_DEMO } from '@/lib/webDemo';

type DocCategory = DocumentRow['category'];

/**
 * What the parent picks. `id` is the stored documents.category; a discharge
 * summary is a hospital visit record, so it is filed under Visits and
 * suggests its own title.
 */
const CATEGORIES: { key: string; id: DocCategory; label: string; defaultTitle?: string }[] = [
  { key: 'prescription', id: 'prescription', label: 'Prescription' },
  { key: 'report', id: 'report', label: 'Report' },
  { key: 'lab_test', id: 'lab_test', label: 'Lab test' },
  { key: 'visit_history', id: 'visit_history', label: 'Visit history' },
  { key: 'discharge_summary', id: 'visit_history', label: 'Discharge summary', defaultTitle: 'Discharge summary' },
  { key: 'vaccination', id: 'vaccination', label: 'Vaccination certificate' },
  { key: 'other', id: 'other', label: 'Other' },
];
const CATEGORY_LABELS = CATEGORIES.map((c) => c.label);

const SOURCES = [
  { key: 'file', label: 'File', icon: 'document-outline' },
  { key: 'gallery', label: 'Gallery', icon: 'image-outline' },
  { key: 'camera', label: 'Camera', icon: 'camera-outline' },
] as const;

export default function UploadDocumentScreen() {
  const insets = useSafeAreaInsets();
  const { child } = useChild();
  const { uploadDocument } = useDocuments(child?.id ?? null);
  // Callers preset these: the Records "+" menu sends a category, the Vaccines
  // tab sends category=vaccination + title=Vaccination certificate.
  const params = useLocalSearchParams<{ category?: string; title?: string }>();
  const presetCategory = CATEGORIES.find((c) => c.key === params.category)?.key;

  // No default: a lab report silently saved as a Prescription is worse than
  // asking. The Records "+" menu and empty states preset it.
  const [categoryKey, setCategoryKey] = useState<string | null>(presetCategory ?? null);
  const chosenCategory = CATEGORIES.find((c) => c.key === categoryKey) ?? null;
  const [title, setTitle] = useState(typeof params.title === 'string' ? params.title : '');
  // Suggested title from the picked file's name. Shown as the placeholder
  // and used if the parent leaves Title empty, so typing never appends to it.
  const [fileTitle, setFileTitle] = useState('');
  const today = istTodayDateOnly();
  // The date on the report (documents.document_date); today unless changed.
  const [documentDate, setDocumentDate] = useState(today);
  const [doctorName, setDoctorName] = useState(WEB_DEMO ? 'Dr. Madhav' : '');
  const [notes, setNotes] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileUri, setFileUri] = useState('');
  const [fileType, setFileType] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const finalTitle = title.trim() || fileTitle || chosenCategory?.defaultTitle || '';
  const canSave = finalTitle.length >= 2 && fileUri.length > 0 && chosenCategory !== null;

  /** Refuse files over the bucket limit before the parent fills the form. */
  function tooLarge(size: number | null | undefined) {
    if ((size ?? 0) <= MAX_DOCUMENT_BYTES) return false;
    notify('File too large', 'Please choose a file under 20 MB.');
    return true;
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      if (tooLarge(asset.size)) return;
      setFileName(asset.name);
      setFileUri(asset.uri);
      setFileType(asset.mimeType ?? 'application/octet-stream');
      setFileSize(asset.size ?? 0);
      setFileTitle(asset.name.replace(/\.[^.]+$/, ''));
    }
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      notify('Permission needed', 'Please allow photo library access to upload images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      if (tooLarge(asset.fileSize)) return;
      const name = asset.fileName ?? (asset.uri.startsWith('data:') ? 'photo.jpg' : asset.uri.split('/').pop() ?? 'photo.jpg');
      setFileName(name);
      setFileUri(asset.uri);
      setFileType(asset.mimeType ?? 'image/jpeg');
      setFileSize(asset.fileSize ?? 0);
      setFileTitle(name.replace(/\.[^.]+$/, ''));
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      notify('Permission needed', 'Please allow camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      if (tooLarge(asset.fileSize)) return;
      const name = asset.fileName ?? (asset.uri.startsWith('data:') ? 'photo.jpg' : asset.uri.split('/').pop() ?? 'photo.jpg');
      setFileName(name);
      setFileUri(asset.uri);
      setFileType(asset.mimeType ?? 'image/jpeg');
      setFileSize(asset.fileSize ?? 0);
    }
  }

  async function handleSave() {
    if (!canSave || saving || !chosenCategory) return;
    setSaving(true);
    try {
      await uploadDocument({
        title: finalTitle,
        category: chosenCategory.id,
        fileUri,
        mimeType: fileType,
        file_size: fileSize,
        doctor_name: doctorName.trim() || undefined,
        notes: notes.trim() || undefined,
        document_date: documentDate,
      });
      setSaved(true);
      // Opened from a deep link there's no screen to go back to. Long enough
      // to read the confirmation.
      setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/records')), 2500);
    } catch (e) {
      notify(
        'Upload failed',
        e instanceof DocumentUploadError ? e.message : 'Failed to save document. Please try again.',
      );
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={32} color={AppColors.success} />
          </View>
          <Text style={typography.heading} accessibilityRole="header" accessibilityLiveRegion="polite">
            Saved
          </Text>
          <Text style={typography.meta}>
            {child?.name ? `Added to ${child.name}'s health records.` : 'Added to health records.'}
          </Text>
          {/* Upload confirmation that also says who can see it (R2-22). */}
          <View style={styles.privacyNote} accessibilityRole="alert">
            <Ionicons name="lock-closed-outline" size={14} color={AppColors.secondary} />
            <Text style={[typography.bodySM, styles.privacyNoteText]}>
              Saved. Only you and doctors you book can see it.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const pickers = { file: pickDocument, gallery: pickImage, camera: takePhoto } as const;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader title="Upload document" subtitle={child?.name ? `For ${child.name}` : undefined} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* File picker */}
        <View style={styles.section}>
          <Text style={typography.sectionLabel}>File</Text>
          {fileUri ? (
            <View style={styles.fileCard}>
              <View style={styles.well}>
                <Ionicons
                  name={fileType.includes('pdf') ? 'document-text-outline' : 'image-outline'}
                  size={Size.iconRow}
                  color={AppColors.secondary}
                />
              </View>
              <View style={styles.fileInfo}>
                <Text style={typography.title} numberOfLines={1}>{fileName}</Text>
                <Text style={typography.meta}>
                  {fileSize > 0 ? `${Math.max(1, Math.round(fileSize / 1024))} KB` : fileType}
                </Text>
              </View>
              <Pressable
                onPress={() => { setFileUri(''); setFileName(''); setFileTitle(''); }}
                accessibilityRole="button"
                accessibilityLabel="Remove file"
                style={styles.removeBtn}
              >
                <Ionicons name="close" size={Size.iconRow} color={AppColors.onSurfaceVariant} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.pickerRow}>
              {SOURCES.map((src) => (
                <Pressable
                  key={src.key}
                  style={({ pressed }) => [styles.pickerBtn, pressed && styles.pickerBtnPressed]}
                  onPress={pickers[src.key]}
                  accessibilityRole="button"
                >
                  <Ionicons name={src.icon} size={20} color={AppColors.secondary} />
                  <Text style={styles.pickerLabel}>{src.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Category */}
        <View style={styles.section}>
          <Text style={typography.sectionLabel}>Category</Text>
          <ChipGroup
            options={CATEGORY_LABELS}
            selected={chosenCategory ? [chosenCategory.label] : []}
            onChange={(sel) => {
              const next = CATEGORIES.find((c) => c.label === sel[0]);
              if (next) setCategoryKey(next.key);
            }}
          />
          {!chosenCategory && fileUri ? (
            <Text style={typography.meta}>Choose a category to upload.</Text>
          ) : null}
        </View>

        <TextInputField
          label="Title"
          placeholder={fileTitle || chosenCategory?.defaultTitle || 'e.g. Blood test results'}
          hint={
            !title && fileTitle
              ? '(file name used if left empty)'
              : !title && chosenCategory?.defaultTitle
                ? '(used if left empty)'
                : undefined
          }
          hintInline
          value={title}
          onChangeText={setTitle}
        />

        <DateField
          label="Date on the report"
          value={documentDate}
          onChange={setDocumentDate}
          max={today}
        />

        <TextInputField
          label="Doctor"
          hint="(optional)"
          hintInline
          placeholder="e.g. Dr. Sarah Miller"
          value={doctorName}
          onChangeText={setDoctorName}
        />

        <TextInputField
          label="Notes"
          hint="(optional)"
          hintInline
          placeholder="Add any notes about this document..."
          multiline
          numberOfLines={3}
          value={notes}
          onChangeText={setNotes}
          textAlignVertical="top"
          style={styles.inputMulti}
        />
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <GradientButton
          label={saving ? 'Saving...' : 'Upload document'}
          onPress={handleSave}
          disabled={!canSave}
          loading={saving}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: AppColors.mintSurface,
  },
  privacyNoteText: { color: AppColors.onSurface, flexShrink: 1 },
  screen: { flex: 1, backgroundColor: AppColors.surface },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },

  section: { gap: 8 },

  pickerRow: { flexDirection: 'row', gap: 8 },
  pickerBtn: {
    flex: 1,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  pickerBtnPressed: { backgroundColor: AppColors.surfaceContainerLow },
  pickerLabel: { fontFamily: FontFamily.medium, fontSize: 13, color: AppColors.onSurface },

  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  well: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: { flex: 1, gap: 2 },
  removeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  inputMulti: {
    minHeight: 96,
    paddingTop: 12,
    paddingBottom: 12,
    // Web: drop the browser focus outline so the token focus ring shows.
    ...(Platform.OS === 'web' ? { outlineStyle: 'solid' as const, outlineWidth: 0 } : null),
  },

  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: AppColors.surface,
  },

  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: AppColors.successSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
});
