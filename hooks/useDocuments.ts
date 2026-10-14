import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { istTodayDateOnly } from '@/hooks/useGrowth';
import { supabase } from '@/lib/supabase';

export interface DocumentRow {
  id: string;
  child_id: string;
  title: string;
  category: 'prescription' | 'report' | 'lab_test' | 'visit_history' | 'vaccination' | 'other';
  /** Object path in the private `documents` bucket: <parent_id>/<child_id>/<file>. */
  file_url: string;
  file_type: string; // 'pdf' | 'image' | etc
  file_size: number | null;
  doctor_name: string | null;
  notes: string | null;
  document_date: string;
  created_at: string;
}

/** Private Storage bucket (see supabase/migrations/0016_documents_storage.sql). */
export const DOCUMENTS_BUCKET = 'documents';
/** Matches the bucket's file_size_limit. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
/** Signed URLs are short-lived: long enough to open, not to pass around. */
const SIGNED_URL_TTL_SECONDS = 5 * 60;

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export const ALLOWED_DOCUMENT_MIME_TYPES = Object.keys(EXT_BY_MIME);

/** Friendly error the screens can show as-is. */
export class DocumentUploadError extends Error {}

/** Old rows held a device-local URI; only bucket paths can be opened. */
function isStoragePath(fileUrl: string) {
  return !/^[a-z][a-z0-9+.-]*:/i.test(fileUrl);
}

function randomName() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function downloadName(doc: Pick<DocumentRow, 'title' | 'file_url'>) {
  const ext = doc.file_url.split('.').pop() ?? '';
  const base = doc.title.replace(/[^\w\- ]+/g, '').trim() || 'record';
  return ext ? `${base}.${ext}` : base;
}

/** Mint a short-lived signed URL for a record's file. RLS decides who may. */
export async function getDocumentSignedUrl(
  doc: Pick<DocumentRow, 'title' | 'file_url'>,
  options: { download?: boolean; expiresIn?: number } = {},
) {
  if (!isStoragePath(doc.file_url)) {
    throw new DocumentUploadError('This file was saved before secure storage. Please upload it again.');
  }
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(doc.file_url, options.expiresIn ?? SIGNED_URL_TTL_SECONDS, {
      download: options.download ? downloadName(doc) : undefined,
    });
  if (error || !data?.signedUrl) {
    throw new DocumentUploadError('Could not open this file. Please try again.');
  }
  return data.signedUrl;
}

/**
 * View / download a record's file. Web: the signed URL downloads the file.
 * Native: opens it in the in-app browser (images and PDFs render there,
 * and can be saved or shared from the system sheet).
 */
export async function openDocumentFile(doc: Pick<DocumentRow, 'title' | 'file_url'>) {
  if (Platform.OS === 'web') {
    // The signed URL carries Content-Disposition: attachment, so following it
    // saves the file without leaving the app (and isn't caught by popup blockers).
    const url = await getDocumentSignedUrl(doc, { download: true });
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const url = await getDocumentSignedUrl(doc);
  await WebBrowser.openBrowserAsync(url);
}

export function useDocuments(childId: string | null) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!childId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('documents')
      .select('*')
      .eq('child_id', childId)
      .order('document_date', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setDocuments(data ?? []);
    }
    setLoading(false);
  }, [childId]);

  useEffect(() => { fetch(); }, [fetch]);

  /**
   * Uploads the picked file to the private bucket under
   * <parent_id>/<child_id>/, then records its object path in `documents`.
   */
  async function uploadDocument(params: {
    title: string;
    category: DocumentRow['category'];
    /** Local URI from the picker (file://, content://, blob: or data:). */
    fileUri: string;
    mimeType: string;
    file_size?: number;
    doctor_name?: string;
    notes?: string;
    document_date?: string;
  }) {
    if (!childId) throw new DocumentUploadError('No child selected');

    const mimeType = params.mimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : params.mimeType.toLowerCase();
    const ext = EXT_BY_MIME[mimeType];
    if (!ext) {
      throw new DocumentUploadError('Only PDF, JPG, PNG, WEBP or HEIC files can be uploaded.');
    }
    if ((params.file_size ?? 0) > MAX_DOCUMENT_BYTES) {
      throw new DocumentUploadError('This file is larger than 20 MB. Please choose a smaller file.');
    }

    const { data: { session } } = await supabase.auth.getSession();
    const parentId = session?.user.id;
    if (!parentId) throw new DocumentUploadError('Please sign in again to upload.');

    let body: ArrayBuffer;
    try {
      body = await (await globalThis.fetch(params.fileUri)).arrayBuffer();
    } catch {
      throw new DocumentUploadError('Could not read this file. Please pick it again.');
    }
    if (body.byteLength > MAX_DOCUMENT_BYTES) {
      throw new DocumentUploadError('This file is larger than 20 MB. Please choose a smaller file.');
    }

    const path = `${parentId}/${childId}/${randomName()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, body, { contentType: mimeType, upsert: false });
    if (upErr) throw new DocumentUploadError('Upload failed. Please check your connection and try again.');

    const { error: err } = await supabase
      .from('documents')
      .insert({
        child_id: childId,
        title: params.title,
        category: params.category,
        file_url: path,
        file_type: mimeType === 'application/pdf' ? 'pdf' : 'image',
        file_size: body.byteLength,
        doctor_name: params.doctor_name ?? null,
        notes: params.notes ?? null,
        document_date: params.document_date ?? istTodayDateOnly(),
      });

    if (err) {
      // Don't leave an orphaned file behind.
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
      throw new DocumentUploadError('Failed to save document. Please try again.');
    }
    await fetch();
  }

  async function deleteDocument(docId: string) {
    const doc = documents.find((d) => d.id === docId);
    const { error: err } = await supabase
      .from('documents')
      .delete()
      .eq('id', docId);

    if (err) throw new Error(err.message);
    if (doc && isStoragePath(doc.file_url)) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.file_url]);
    }
    await fetch();
  }

  return { documents, loading, error, uploadDocument, deleteDocument, refetch: fetch };
}
