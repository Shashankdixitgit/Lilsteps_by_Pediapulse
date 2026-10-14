import { supabase } from '@/lib/supabase';

/** Optional "About you" answers saved on the parents row (0026, R2-13). */
export interface ParentProfileExtras {
  city: string | null;
  preferredLanguage: string | null;
  /** 'Mother' | 'Father' | 'Grandparent' | 'Guardian' | null */
  relationship: string | null;
}

export const EMPTY_PARENT_EXTRAS: ParentProfileExtras = { city: null, preferredLanguage: null, relationship: null };

export async function fetchParentExtras(userId: string): Promise<ParentProfileExtras> {
  const { data, error } = await supabase
    .from('parents')
    .select('city, preferred_language, relationship')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return EMPTY_PARENT_EXTRAS;
  return {
    city: (data.city as string | null) ?? null,
    preferredLanguage: (data.preferred_language as string | null) ?? null,
    relationship: (data.relationship as string | null) ?? null,
  };
}

/** Profile row title: the parent's relationship ("Grandparent"), else "Parent". */
export function relationshipLabel(relationship: string | null | undefined): string {
  return relationship || 'Parent';
}
