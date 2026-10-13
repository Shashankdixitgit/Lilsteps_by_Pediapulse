import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';

export interface ChildRow {
  id: string;
  parent_id: string;
  name: string;
  dob: string;
  sex: 'male' | 'female' | 'other';
  blood_group: string | null;
  weight: number | null;
  height: number | null;
  weight_updated_at: string | null;
  height_updated_at: string | null;
  created_at: string;
}

export type AllergyType = 'food' | 'medication' | 'environmental';
export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'unknown';

export interface AllergyRow {
  id: string;
  child_id: string;
  type: AllergyType;
  name: string;
  /** 'unknown' when the parent was not asked (onboarding default, migration 0014). */
  severity: AllergySeverity;
}

export interface ConditionRow {
  id: string;
  child_id: string;
  name: string;
  details: string | null;
}

export interface MedicationRow {
  id: string;
  child_id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
}

export interface ChildWithDetails extends ChildRow {
  allergies: AllergyRow[];
  conditions: ConditionRow[];
  medications: MedicationRow[];
}

export function useChildren() {
  const { user } = useAuth();
  const [children, setChildren] = useState<ChildWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChildren = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data: childRows, error: childErr } = await supabase
      .from('children')
      .select('*')
      .eq('parent_id', user.id)
      .order('created_at', { ascending: true });

    if (childErr) {
      setError(childErr.message);
      setLoading(false);
      return;
    }

    if (!childRows || childRows.length === 0) {
      setChildren([]);
      setLoading(false);
      return;
    }

    const childIds = childRows.map(c => c.id);

    const [allergiesRes, conditionsRes, medsRes] = await Promise.all([
      supabase.from('allergies').select('*').in('child_id', childIds),
      supabase.from('conditions').select('*').in('child_id', childIds),
      supabase.from('medications').select('*').in('child_id', childIds),
    ]);

    const result: ChildWithDetails[] = childRows.map(child => ({
      ...child,
      allergies: (allergiesRes.data ?? []).filter(a => a.child_id === child.id),
      conditions: (conditionsRes.data ?? []).filter(c => c.child_id === child.id),
      medications: (medsRes.data ?? []).filter(m => m.child_id === child.id),
    }));

    setChildren(result);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  async function addChild(data: {
    name: string;
    dob: string;
    sex: 'male' | 'female' | 'other';
    blood_group?: string;
    weight?: number;
    height?: number;
    allergies?: { type: AllergyType; name: string; severity?: AllergySeverity }[];
    conditions?: { name: string; details?: string }[];
    medications?: { name: string; dosage?: string; frequency?: string }[];
  }) {
    if (!user) throw new Error('Not authenticated');

    const { data: child, error: childErr } = await supabase
      .from('children')
      .insert({
        parent_id: user.id,
        name: data.name,
        dob: data.dob,
        sex: data.sex,
        blood_group: data.blood_group || null,
        weight: data.weight || null,
        height: data.height || null,
        weight_updated_at: data.weight ? new Date().toISOString() : null,
        height_updated_at: data.height ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (childErr) throw new Error(childErr.message);

    // Insert related data in parallel
    const promises: PromiseLike<unknown>[] = [];

    if (data.allergies && data.allergies.length > 0) {
      promises.push(
        supabase.from('allergies').insert(
          data.allergies.map(a => ({
            child_id: child.id,
            type: a.type,
            name: a.name,
            severity: a.severity || 'unknown',
          }))
        )      );
    }

    if (data.conditions && data.conditions.length > 0) {
      promises.push(
        supabase.from('conditions').insert(
          data.conditions.map(c => ({
            child_id: child.id,
            name: c.name,
            details: c.details || null,
          }))
        )      );
    }

    if (data.medications && data.medications.length > 0) {
      promises.push(
        supabase.from('medications').insert(
          data.medications.map(m => ({
            child_id: child.id,
            name: m.name,
            dosage: m.dosage || null,
            frequency: m.frequency || null,
          }))
        )      );
    }

    await Promise.all(promises);
    await fetchChildren();
    return child;
  }

  async function updateChild(childId: string, updates: Partial<Pick<ChildRow, 'name' | 'weight' | 'height' | 'blood_group'>>) {
    const updateData: Record<string, unknown> = { ...updates };
    if (updates.weight !== undefined) updateData.weight_updated_at = new Date().toISOString();
    if (updates.height !== undefined) updateData.height_updated_at = new Date().toISOString();

    const { error: err } = await supabase
      .from('children')
      .update(updateData)
      .eq('id', childId);

    if (err) throw new Error(err.message);
    await fetchChildren();
  }

  return { children, loading, error, addChild, updateChild, refetch: fetchChildren };
}
