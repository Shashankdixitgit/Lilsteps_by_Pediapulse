import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/chip-group';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { confirmAsync, notify } from '@/components/growth/confirm';
import { HEALTH_CATEGORIES, SEVERITY_AWARE_CATEGORIES } from '@/components/health-log/categories';
import { PhotoAttach } from '@/components/health-log/PhotoAttach';
import { SeverityDots } from '@/components/health-log/SeverityDots';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { StatusPill, type StatusTone } from '@/components/ui/StatusPill';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useChild } from '@/context/child';
import { useHealthNotes, type HealthNoteRow } from '@/hooks/useHealthNotes';
import { formatDate } from '@/lib/date';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';
import { WEB_DEMO } from '@/lib/webDemo';

const CATEGORY_LABELS = HEALTH_CATEGORIES.map((c) => c.label);

/** Same words as the SeverityDots scale. */
const SEVERITY: Record<number, { label: string; tone: StatusTone }> = {
  1: { label: 'Mild', tone: 'success' },
  2: { label: 'Moderate', tone: 'warning' },
  3: { label: 'Concerning', tone: 'warning' },
  4: { label: 'Urgent', tone: 'danger' },
};

/** "Today · 4:05 pm", "12 Oct · 9:30 am" (en-IN, device time). */
function formatStamp(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const day = d.toDateString() === new Date().toDateString() ? `Today, ${formatDate(d)}` : formatDate(d);
  return `${day} · ${time}`;
}

export default function HealthLogScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [category, setCategory] = useState<HealthNoteRow['category']>('symptom');
  const [note, setNote] = useState(WEB_DEMO ? 'Slight cough at night, no fever.' : '');
  const [severity, setSeverity] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; mime: string } | null>(null);
  // Editing an existing note: its id, and whether its saved photo is kept.
  const [editing, setEditing] = useState<HealthNoteRow | null>(null);
  const [keepPhoto, setKeepPhoto] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { child } = useChild();
  const { user } = useAuth();
  const { notes, photoUrls, loading, addNote, updateNote, deleteNote } = useHealthNotes(child?.id ?? null);
  const childName = child?.name ?? 'Child';

  const activeCat = HEALTH_CATEGORIES.find((c) => c.id === category) ?? HEALTH_CATEGORIES[0];
  const canSave = note.trim().length >= 3;
  const showSeverity = SEVERITY_AWARE_CATEGORIES.includes(category);
  const existingPhotoUrl = editing?.photo_url && keepPhoto ? photoUrls[editing.photo_url] ?? null : null;

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

  function resetForm() {
    setEditing(null);
    setKeepPhoto(true);
    setNote('');
    setSeverity(1);
    setPhoto(null);
  }

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      let photoPath: string | undefined;
      if (photo && user) {
        photoPath = await uploadPhoto(photo.uri, photo.mime, user.id);
      }
      if (editing) {
        await updateNote(editing.id, {
          category,
          content: note.trim(),
          severity: showSeverity ? severity : null,
          // New photo replaces; removed → null; otherwise keep.
          photo_url: photoPath ?? (keepPhoto ? undefined : null),
        });
        setSavedMsg('Note updated.');
      } else {
        await addNote({
          category,
          content: note.trim(),
          severity: showSeverity ? severity : undefined,
          photo_url: photoPath,
        });
        setSavedMsg(`Added to ${childName}'s health log.`);
      }
      resetForm();
    } catch (e) {
      notify('Could not save note', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(n: HealthNoteRow) {
    setEditing(n);
    setKeepPhoto(true);
    setPhoto(null);
    setCategory(n.category);
    setNote(n.content);
    setSeverity(n.severity ?? 1);
    setSavedMsg(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  async function handleDelete(n: HealthNoteRow) {
    if (deletingId) return;
    const ok = await confirmAsync(
      'Delete this note?',
      `It will be removed from ${childName}'s health log. This can't be undone.`,
      { confirmLabel: 'Delete', destructive: true },
    );
    if (!ok) return;
    setDeletingId(n.id);
    try {
      await deleteNote(n.id);
      if (editing?.id === n.id) resetForm();
      setSavedMsg('Note deleted.');
    } catch {
      notify('Could not delete', 'Please check your connection and try again.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader title={editing ? 'Edit note' : 'Health log'} subtitle={child?.name ? `For ${child.name}` : undefined} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.timestampRow}>
          <Ionicons name="time-outline" size={14} color={AppColors.muted} />
          <Text style={styles.timestampText}>{formatStamp(editing ? editing.noted_at : new Date())}</Text>
        </View>

        {/* Who reads this (R3-21): the dashboard's visit page lists the
            latest notes. Not watched in real time, so urgent needs go elsewhere. */}
        <View style={styles.doctorInfo}>
          <Ionicons name="information-circle-outline" size={16} color={AppColors.secondary} />
          <Text style={[typography.bodySM, styles.flex]}>
            The LilSteps doctor sees your recent notes when you have a visit. Notes are not checked in real
            time: for anything urgent, book a consult or call 112.
          </Text>
        </View>

        {savedMsg ? (
          <View style={styles.savedNotice} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Ionicons name="checkmark-circle" size={Size.iconRow} color={AppColors.success} />
            <Text style={[typography.bodySM, styles.flex]}>{savedMsg}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={typography.sectionLabel}>Category</Text>
          <ChipGroup
            label="Category"
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
            onChangeText={(t) => {
              setNote(t);
              if (savedMsg) setSavedMsg(null);
            }}
            textAlignVertical="top"
            autoFocus={notes.length === 0}
            accessibilityLabel="Note"
            style={styles.input}
          />
        </View>

        {showSeverity && (
          <View style={styles.section}>
            <Text style={typography.sectionLabel}>How bad is it?</Text>
            <SeverityDots value={severity} onChange={setSeverity} />
          </View>
        )}

        {existingPhotoUrl && !photo ? (
          <View style={styles.existingPhoto}>
            <Image source={{ uri: existingPhotoUrl }} style={styles.existingThumb} contentFit="cover" />
            <Text style={[typography.bodySM, styles.flex]}>Photo saved with this note</Text>
            <TextButton label="Remove" tone="danger" onPress={() => setKeepPhoto(false)} accessibilityLabel="Remove photo" />
          </View>
        ) : (
          <PhotoAttach uri={photo?.uri ?? null} onChange={setPhoto} />
        )}

        {editing ? (
          <TextButton label="Cancel editing" onPress={resetForm} style={styles.cancelEdit} />
        ) : null}

        <View style={styles.section}>
          <Text style={typography.headingSM}>{childName}&apos;s notes</Text>
          {loading && notes.length === 0 ? (
            <ActivityIndicator color={AppColors.primary} />
          ) : notes.length === 0 ? (
            <Text style={typography.bodySM}>
              No notes yet. Notes you save appear here, newest first.
            </Text>
          ) : (
            <View style={styles.listCard}>
              {notes.map((n, i) => (
                <NoteItem
                  key={n.id}
                  note={n}
                  photoUrl={n.photo_url ? photoUrls[n.photo_url] ?? null : null}
                  divider={i > 0}
                  editing={editing?.id === n.id}
                  deleting={deletingId === n.id}
                  onEdit={() => startEdit(n)}
                  onDelete={() => handleDelete(n)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <GradientButton
          label={editing ? 'Save changes' : 'Save note'}
          onPress={handleSave}
          disabled={!canSave}
          loading={saving}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** One saved note: category + time, severity, text, photo, Edit / Delete. */
function NoteItem({
  note,
  photoUrl,
  divider,
  editing,
  deleting,
  onEdit,
  onDelete,
}: {
  note: HealthNoteRow;
  photoUrl: string | null;
  divider: boolean;
  editing: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = HEALTH_CATEGORIES.find((c) => c.id === note.category) ?? HEALTH_CATEGORIES[HEALTH_CATEGORIES.length - 1];
  const sev = note.severity ? SEVERITY[note.severity] : null;
  const stamp = formatStamp(note.noted_at);
  return (
    <View
      style={[styles.noteRow, divider && styles.divider, editing && styles.noteRowEditing]}
      accessible={false}
    >
      <View style={styles.noteTop}>
        <View style={styles.noteWell}>
          <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={Size.iconRow} color={AppColors.primary} />
        </View>
        <View style={styles.noteHead}>
          <Text style={typography.title} numberOfLines={1}>
            {cat.label}
          </Text>
          <Text style={typography.meta} numberOfLines={1}>
            {stamp}
          </Text>
        </View>
        {sev ? <StatusPill dot tone={sev.tone} label={sev.label} /> : null}
      </View>
      <View style={styles.noteBody}>
        <Text style={[typography.body, styles.flex]}>{note.content}</Text>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.thumb}
            contentFit="cover"
            accessibilityLabel={`Photo with the ${cat.label.toLowerCase()} note`}
          />
        ) : null}
      </View>
      <View style={styles.noteActions}>
        <TextButton label={editing ? 'Editing' : 'Edit'} onPress={onEdit} disabled={editing} accessibilityLabel={`Edit ${cat.label} note from ${stamp}`} />
        <TextButton
          label={deleting ? 'Deleting…' : 'Delete'}
          tone="danger"
          onPress={onDelete}
          disabled={deleting}
          accessibilityLabel={`Delete ${cat.label} note from ${stamp}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  doctorInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
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

  flex: { flex: 1, minWidth: 0 },

  savedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.successSurface,
  },

  existingPhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    padding: 12,
  },
  existingThumb: { width: 56, height: 56, borderRadius: Radius.sm, backgroundColor: AppColors.surfaceContainerHigh },
  cancelEdit: { alignSelf: 'flex-start', marginTop: -12 },

  listCard: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    overflow: 'hidden',
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AppColors.border },
  noteRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 8 },
  noteRowEditing: { backgroundColor: AppColors.greenWash },
  noteTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  noteWell: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteHead: { flex: 1, minWidth: 0, gap: 2 },
  noteBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: Radius.sm, backgroundColor: AppColors.surfaceContainerHigh },
  noteActions: { flexDirection: 'row', gap: 8, marginLeft: -12 },
});
