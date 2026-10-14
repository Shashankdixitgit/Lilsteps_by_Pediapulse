import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface HealthNoteRow {
  id: string;
  child_id: string;
  category: 'symptom' | 'behaviour' | 'sleep' | 'feeding' | 'medication' | 'other';
  content: string;
  severity: number | null;
  photo_url: string | null;
  noted_at: string;
  created_at: string;
}

/** Private Storage bucket for health-log photos (<parent_id>/<file>). */
export const HEALTH_PHOTOS_BUCKET = 'health-photos';
const PHOTO_URL_TTL_SECONDS = 60 * 60;

export function useHealthNotes(childId: string | null) {
  const [notes, setNotes] = useState<HealthNoteRow[]>([]);
  /** Signed URLs for note photos, keyed by storage path. */
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!childId) {
      setNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('health_notes')
      .select('*')
      .eq('child_id', childId)
      .order('noted_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      const rows = (data ?? []) as HealthNoteRow[];
      setNotes(rows);
      // The bucket is private: mint short-lived URLs for the thumbnails.
      const paths = rows.map((r) => r.photo_url).filter((p): p is string => !!p);
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from(HEALTH_PHOTOS_BUCKET)
          .createSignedUrls(paths, PHOTO_URL_TTL_SECONDS);
        const map: Record<string, string> = {};
        for (const s of signed ?? []) {
          if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
        }
        setPhotoUrls(map);
      } else {
        setPhotoUrls({});
      }
    }
    setLoading(false);
  }, [childId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function addNote(data: {
    category: HealthNoteRow['category'];
    content: string;
    severity?: number;
    photo_url?: string;
    noted_at?: string;
  }) {
    if (!childId) throw new Error('No child selected');

    const { error: err } = await supabase
      .from('health_notes')
      .insert({
        child_id: childId,
        category: data.category,
        content: data.content,
        severity: data.severity ?? null,
        photo_url: data.photo_url ?? null,
        noted_at: data.noted_at ?? new Date().toISOString(),
      });

    if (err) throw new Error(err.message);
    await fetch();
  }

  /**
   * Edit a note. `photo_url`: a new storage path, null to remove the photo,
   * or undefined to keep it. A replaced or removed photo is deleted.
   */
  async function updateNote(
    id: string,
    data: {
      category: HealthNoteRow['category'];
      content: string;
      severity: number | null;
      photo_url?: string | null;
    },
  ) {
    const before = notes.find((n) => n.id === id);
    const { error: err } = await supabase
      .from('health_notes')
      .update({
        category: data.category,
        content: data.content,
        severity: data.severity,
        ...(data.photo_url !== undefined ? { photo_url: data.photo_url } : null),
      })
      .eq('id', id);
    if (err) throw new Error(err.message);
    if (data.photo_url !== undefined && before?.photo_url && before.photo_url !== data.photo_url) {
      await supabase.storage.from(HEALTH_PHOTOS_BUCKET).remove([before.photo_url]);
    }
    await fetch();
  }

  /** Delete a note and its photo. */
  async function deleteNote(id: string) {
    const before = notes.find((n) => n.id === id);
    const { error: err } = await supabase.from('health_notes').delete().eq('id', id);
    if (err) throw new Error(err.message);
    if (before?.photo_url) {
      await supabase.storage.from(HEALTH_PHOTOS_BUCKET).remove([before.photo_url]);
    }
    await fetch();
  }

  return { notes, photoUrls, loading, error, addNote, updateNote, deleteNote, refetch: fetch };
}
