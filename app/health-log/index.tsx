import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/chip-group';
import { GradientButton } from '@/components/gradient-button';
import { HEALTH_CATEGORIES, SEVERITY_AWARE_CATEGORIES } from '@/components/health-log/categories';
import { PhotoAttach } from '@/components/health-log/PhotoAttach';
import { SeverityDots } from '@/components/health-log/SeverityDots';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useChild } from '@/context/child';
import { useHealthNotes, type HealthNoteRow } from '@/hooks/useHealthNotes';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';

const CATEGORY_LABELS = HEALTH_CATEGORIES.map((c) => c.label);

function formatNow(): string {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `Today, ${now.getDate()} ${months[now.getMonth()]} · ${hour}:${m} ${ampm}`;
}

export default function HealthLogScreen() {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<HealthNoteRow['category']>('symptom');
  const [note, setNote] = useState('');
  const [severity, setSeverity] = useState(1);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; mime: string } | null>(null);

  const { child } = useChild();
  const { user } = useAuth();
  const { addNote } = useHealthNotes(child?.id ?? null);
  const childName = child?.name ?? 'Child';

  const activeCat = HEALTH_CATEGORIES.find((c) => c.id === category) ?? HEALTH_CATEGORIES[0];
  const canSave = note.trim().length >= 3;
  const showSeverity = SEVERITY_AWARE_CATEGORIES.includes(category);

  async function uploadPhoto(uri: string, mime: string, userId: string): Promise<string> {
    const res = await fetch(uri);
    const arrayBuffer = await res.arrayBuffer();
    const ext = (mime.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('health-photos')
      .upload(path, arrayBuffer, { contentType: mime, upsert: false });
    if (uploadErr) throw new Error(uploadErr.message);
    return path;
  }

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      let photoPath: string | undefined;
      if (photo && user) {
        photoPath = await uploadPhoto(photo.uri, photo.mime, user.id);
      }
      await addNote({
        category,
        content: note.trim(),
        severity: showSeverity ? severity : undefined,
        photo_url: photoPath,
      });
      setSaved(true);
      setTimeout(() => router.replace('/(tabs)'), 1500);
    } catch (e) {
      Alert.alert('Could not save note', e instanceof Error ? e.message : 'Please try again.');
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
          <Text style={typography.heading}>Note saved</Text>
          <Text style={typography.meta}>Added to {childName}&apos;s health log.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader title="Health log" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.timestampRow}>
          <Ionicons name="time-outline" size={14} color={AppColors.muted} />
          <Text style={styles.timestampText}>{formatNow()}</Text>
        </View>

        <View style={styles.section}>
          <Text style={typography.sectionLabel}>Category</Text>
          <ChipGroup
            options={CATEGORY_LABELS}
            selected={[activeCat.label]}
            onChange={(sel) => {
              const next = HEALTH_CATEGORIES.find((c) => c.label === sel[0]);
              if (next) setCategory(next.id);
            }}
          />
        </View>

        <View style={styles.section}>
          <Text style={typography.sectionLabel}>Note</Text>
          <TextInputField
            placeholder={activeCat.placeholder}
            multiline
            numberOfLines={5}
            value={note}
            onChangeText={setNote}
            textAlignVertical="top"
            autoFocus
            style={styles.input}
          />
        </View>

        {showSeverity && (
          <View style={styles.section}>
            <Text style={typography.sectionLabel}>How bad is it?</Text>
            <SeverityDots value={severity} onChange={setSeverity} />
          </View>
        )}

        <PhotoAttach uri={photo?.uri ?? null} onChange={setPhoto} />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <GradientButton label="Save note" onPress={handleSave} disabled={!canSave} loading={saving} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },

  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: AppColors.surfaceContainer,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timestampText: { fontFamily: FontFamily.medium, fontSize: 12, lineHeight: 16, color: AppColors.muted },

  section: { gap: 8 },

  input: {
    minHeight: 120,
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
