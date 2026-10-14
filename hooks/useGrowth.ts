import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface GrowthRow {
  id: string;
  child_id: string;
  weight: number | null;
  height: number | null;
  note: string | null;
  measured_at: string;
  created_at: string;
}

export interface GrowthInput {
  weight?: number | null;
  height?: number | null;
  note?: string | null;
  /** 'YYYY-MM-DD'. Defaults to today in India (IST). */
  measured_at?: string;
}

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Today's calendar date in India (IST, UTC+5:30) as 'YYYY-MM-DD',
 *  whatever the device's time zone. */
export function istTodayDateOnly(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Newest first: by measurement day, then by when it was logged. */
function sortNewestFirst(rows: GrowthRow[]): GrowthRow[] {
  return [...rows].sort((a, b) =>
    a.measured_at === b.measured_at
      ? b.created_at.localeCompare(a.created_at)
      : b.measured_at.localeCompare(a.measured_at),
  );
}

export function useGrowth(childId: string | null) {
  const [measurements, setMeasurements] = useState<GrowthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<GrowthRow[] | null> => {
    if (!childId) return [];
    const { data, error: err } = await supabase
      .from('growth_measurements')
      .select('*')
      .eq('child_id', childId)
      .order('measured_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
      return null;
    }
    return sortNewestFirst((data ?? []) as GrowthRow[]);
  }, [childId]);

  const fetch = useCallback(async () => {
    if (!childId) {
      setMeasurements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const rows = await load();
    if (rows) setMeasurements(rows);
    setLoading(false);
  }, [childId, load]);

  useEffect(() => { fetch(); }, [fetch]);

  /**
   * children.weight / height mirror the LATEST measurement (by date, then by
   * when it was logged), never just the last thing typed: a back-dated entry
   * doesn't overwrite today's value, and deleting a typo restores the one
   * before it. Only the fields the change touched are rewritten, so deleting
   * a height-only entry never clears the onboarding weight.
   */
  async function syncChild(rows: GrowthRow[], touched: { weight: boolean; height: boolean }) {
    if (!childId || (!touched.weight && !touched.height)) return;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};
    if (touched.weight) {
      const latest = rows.find((r) => r.weight != null);
      updates.weight = latest?.weight ?? null;
      updates.weight_updated_at = latest ? now : null;
    }
    if (touched.height) {
      const latest = rows.find((r) => r.height != null);
      updates.height = latest?.height ?? null;
      updates.height_updated_at = latest ? now : null;
    }
    const { error: err } = await supabase.from('children').update(updates).eq('id', childId);
    if (err) throw new Error(err.message);
  }

  /** Re-read the list, mirror the latest values onto the child, and update state. */
  async function afterChange(touched: { weight: boolean; height: boolean }) {
    const rows = await load();
    if (!rows) throw new Error('Saved, but the list could not be refreshed. Pull to refresh.');
    setMeasurements(rows);
    await syncChild(rows, touched);
  }

  /**
   * The sign-up weight/height lives only on `children`. Before the first
   * logged entry replaces it there, keep it as a history row, so the chart
   * keeps the starting point and deleting a typo can fall back to it.
   */
  async function ensureBaseline() {
    if (!childId || measurements.length > 0) return;
    const { count } = await supabase
      .from('growth_measurements')
      .select('id', { count: 'exact', head: true })
      .eq('child_id', childId);
    if ((count ?? 0) > 0) return;
    const { data: c } = await supabase
      .from('children')
      .select('weight, height, weight_updated_at, height_updated_at, created_at')
      .eq('id', childId)
      .maybeSingle();
    if (!c || (c.weight == null && c.height == null)) return;
    const stamp = c.height_updated_at ?? c.weight_updated_at ?? c.created_at;
    await supabase.from('growth_measurements').insert({
      child_id: childId,
      weight: c.weight,
      height: c.height,
      note: null,
      measured_at: stamp ? istTodayDateOnly(new Date(stamp)) : istTodayDateOnly(),
    });
  }

  /** `replacesBaseline`: the parent edited the sign-up values shown before any
   *  entry existed, so this row replaces them instead of adding to them. */
  async function addMeasurement(data: GrowthInput, { replacesBaseline = false } = {}) {
    if (!childId) throw new Error('No child selected');
    if (!replacesBaseline) await ensureBaseline();

    const { error: err } = await supabase
      .from('growth_measurements')
      .insert({
        child_id: childId,
        weight: data.weight ?? null,
        height: data.height ?? null,
        note: data.note ?? null,
        measured_at: data.measured_at ?? istTodayDateOnly(),
      });
    if (err) throw new Error(err.message);

    await afterChange({ weight: data.weight != null, height: data.height != null });
  }

  async function updateMeasurement(id: string, data: GrowthInput) {
    if (!childId) throw new Error('No child selected');
    const before = measurements.find((m) => m.id === id);

    const { error: err } = await supabase
      .from('growth_measurements')
      .update({
        weight: data.weight ?? null,
        height: data.height ?? null,
        note: data.note ?? null,
        ...(data.measured_at ? { measured_at: data.measured_at } : {}),
      })
      .eq('id', id);
    if (err) throw new Error(err.message);

    await afterChange({
      weight: data.weight != null || before?.weight != null,
      height: data.height != null || before?.height != null,
    });
  }

  async function deleteMeasurement(id: string) {
    if (!childId) throw new Error('No child selected');
    const before = measurements.find((m) => m.id === id);

    const { error: err } = await supabase.from('growth_measurements').delete().eq('id', id);
    if (err) throw new Error(err.message);

    await afterChange({ weight: before?.weight != null, height: before?.height != null });
  }

  return {
    measurements,
    loading,
    error,
    addMeasurement,
    updateMeasurement,
    deleteMeasurement,
    refetch: fetch,
  };
}
