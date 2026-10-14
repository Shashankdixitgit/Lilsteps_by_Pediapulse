import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Opens a parent-uploaded health record. documents.file_url holds the object
 * path in the private `documents` bucket (migration 0016); we mint a
 * short-lived signed URL on every click and redirect to it, so a link on the
 * consult page never goes stale. RLS decides whether this doctor may see the
 * row and the object (doctor_has_appointment_with_child).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  const { data: doc } = await supabase
    .from('documents')
    .select('file_url')
    .eq('id', id)
    .maybeSingle<{ file_url: string }>();

  if (!doc) return message('This record was not found, or you do not have access to it.', 404);

  const path = doc.file_url;
  if (/^https?:\/\//i.test(path)) return NextResponse.redirect(path);
  if (/^(file|content|ph|blob):/i.test(path)) {
    return message('This record was saved before uploads were enabled and only exists on the parent’s phone. Ask the parent to upload it again.', 410);
  }

  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60 * 10);
  if (error || !data?.signedUrl) {
    return message(`Could not open this record: ${error?.message ?? 'no link returned'}.`, 502);
  }
  return NextResponse.redirect(data.signedUrl);
}

function message(text: string, status: number) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Record</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#0a0a0a"><p>${text.replace(/</g, '&lt;')}</p><p><a href="javascript:history.back()" style="color:#0a0a0a">← Back</a></p></body>`;
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
