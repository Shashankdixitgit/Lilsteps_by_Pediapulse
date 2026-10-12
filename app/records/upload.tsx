import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
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
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useDocuments, type DocumentRow } from '@/hooks/useDocuments';
import { typography } from '@/styles/global';

type DocCategory = DocumentRow['category'];

const CATEGORIES: { id: DocCategory; label: string }[] = [
  { id: 'prescription', label: 'Prescription' },
  { id: 'report', label: 'Report' },
  { id: 'lab_test', label: 'Lab test' },
  { id: 'visit_history', label: 'Visit history' },
  { id: 'other', label: 'Other' },
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

  const [category, setCategory] = useState<DocCategory>('prescription');
  const [title, setTitle] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [notes, setNotes] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileUri, setFileUri] = useState('');
  const [fileType, setFileType] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const canSave = title.trim().length >= 2 && fileUri.length > 0;

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setFileName(asset.name);
      setFileUri(asset.uri);
      setFileType(asset.mimeType ?? 'application/octet-stream');
      setFileSize(asset.size ?? 0);
      if (!title.trim()) {
        setTitle(asset.name.replace(/\.[^.]+$/, ''));
      }
    }
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to upload images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const name = asset.uri.split('/').pop() ?? 'photo.jpg';
      setFileName(name);
      setFileUri(asset.uri);
      setFileType(asset.mimeType ?? 'image/jpeg');
      setFileSize(asset.fileSize ?? 0);
      if (!title.trim()) {
        setTitle(name.replace(/\.[^.]+$/, ''));
      }
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const name = asset.uri.split('/').pop() ?? 'photo.jpg';
      setFileName(name);
      setFileUri(asset.uri);
      setFileType(asset.mimeType ?? 'image/jpeg');
      setFileSize(asset.fileSize ?? 0);
    }
  }

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await uploadDocument({
        title: title.trim(),
        category,
        file_url: fileUri,
        file_type: fileType.includes('pdf') ? 'pdf' : 'image',
        file_size: fileSize,
        doctor_name: doctorName.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => router.back(), 1500);
    } catch {
      Alert.alert('Error', 'Failed to save document. Please try again.');
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
          <Text style={typography.heading}>Document saved</Text>
          <Text style={typography.meta}>Added to health records.</Text>
        </View>
      </View>
    );
  }

  const pickers = { file: pickDocument, gallery: pickImage, camera: takePhoto } as const;
  const activeLabel = CATEGORIES.find((c) => c.id === category)?.label ?? CATEGORY_LABELS[0];

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader title="Upload document" />

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
                  {fileSize > 0 ? `${(fileSize / 1024).toFixed(0)} KB` : fileType}
                </Text>
              </View>
              <Pressable
                onPress={() => { setFileUri(''); setFileName(''); }}
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
            selected={[activeLabel]}
            onChange={(sel) => {
              const next = CATEGORIES.find((c) => c.label === sel[0]);
              if (next) setCategory(next.id);
            }}
          />
        </View>

        <TextInputField
          label="Title"
          placeholder="e.g. Blood test results"
          value={title}
          onChangeText={setTitle}
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
