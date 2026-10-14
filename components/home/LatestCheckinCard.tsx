import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { useCompactWidth } from '@/components/home/useCompactWidth';
import { StatusPill } from '@/components/ui/StatusPill';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { formatDate } from '@/lib/date';
import { supabase } from '@/lib/supabase';

/** How far back Home looks for a check-in summary the parent didn't book from. */
const LATEST_CHECKIN_DAYS = 7;

export interface LatestCheckin {
  id: string;
  createdAt: string;
  complaint: string;
  urgency: 'routine' | 'soon' | 'urgent';
}

/** The child's live (non-cancelled) appointments, as Home has them. */
interface LiveAppointment {
  ai_summary_id: string | null;
  created_at: string;
}

/**
 * Newest finished check-in (summary generated) for this child from the last
 * 7 days that the parent hasn't acted on yet. Without this, a summary the
 * parent didn't book from could not be found again.
 *
 * Hidden when a live booking uses it (ai_summary_id), and also when it is
 * older than the child's latest live booking: a parent who checks in, then
 * books through "Book a doctor" (not linked to the check-in), has acted on
 * it, so Home must not say "Not booked yet" (H1). A check-in made after the
 * latest booking still shows. The caller loads it (Home calls `refetch` in
 * its focus effect, which also re-runs on child switch).
 */
export function useLatestUnbookedCheckin(childId: string | null, liveAppointments: LiveAppointment[]) {
  const [rows, setRows] = useState<LatestCheckin[]>([]);

  const refetch = useCallback(async () => {
    if (!childId) {
      setRows([]);
      return;
    }
    const since = new Date(Date.now() - LATEST_CHECKIN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('checkin_sessions')
      .select('id, created_at, initial_complaint, ai_summary')
      .eq('child_id', childId)
      .not('ai_summary', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error || !data) {
      setRows([]);
      return;
    }
    setRows(
      (data as { id: string; created_at: string; initial_complaint: string | null; ai_summary: unknown }[]).map((r) => {
        const s = (r.ai_summary ?? {}) as { chiefComplaint?: unknown; parentSummary?: unknown; suggestedUrgency?: unknown };
        const urgency = s.suggestedUrgency === 'urgent' || s.suggestedUrgency === 'soon' ? s.suggestedUrgency : 'routine';
        // Plain words for the parent first; chiefComplaint is written for the doctor.
        const complaint =
          typeof s.parentSummary === 'string' && s.parentSummary.trim()
            ? s.parentSummary.trim()
            : typeof s.chiefComplaint === 'string' && s.chiefComplaint.trim()
            ? s.chiefComplaint.trim()
            : (r.initial_complaint ?? '').trim();
        return { id: r.id, createdAt: r.created_at, complaint, urgency };
      }),
    );
  }, [childId]);

  const booked = new Set<string>();
  let lastBookedAt = 0;
  for (const a of liveAppointments) {
    if (a.ai_summary_id) booked.add(a.ai_summary_id);
    const t = Date.parse(a.created_at);
    if (Number.isFinite(t) && t > lastBookedAt) lastBookedAt = t;
  }
  const latest = rows.find((r) => !booked.has(r.id) && Date.parse(r.createdAt) > lastBookedAt) ?? null;
  return { latest, refetch };
}

const URGENCY_PILL = {
  urgent: { tone: 'danger', label: 'See a doctor today' },
  soon: { tone: 'warning', label: 'Book in 1–2 days' },
  routine: { tone: 'info', label: 'Routine' },
} as const;

interface LatestCheckinCardProps {
  checkin: LatestCheckin;
  onPress: () => void;
}

/** Home card: "Your check-in summary · Fever for 2 days". Opens the summary (book from there). */
export function LatestCheckinCard({ checkin, onPress }: LatestCheckinCardProps) {
  const compact = useCompactWidth();
  const pill = URGENCY_PILL[checkin.urgency];
  const meta = `Checked in ${formatDate(checkin.createdAt)} · Not booked yet`;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`Your check-in summary: ${checkin.complaint}. ${pill.label}. ${meta}. Open to book a doctor`}
      bg={AppColors.card}
      bgPressed={AppColors.surfaceContainerLow}
      style={styles.card}
    >
      {compact ? null : (
        <View style={styles.iconWell}>
          <Ionicons name="document-text-outline" size={18} color={AppColors.primary} />
        </View>
      )}
      <View style={styles.text}>
        <StatusPill tone={pill.tone} label={pill.label} />
        <Text style={styles.title}>
          {checkin.complaint ? `Your check-in: ${checkin.complaint}` : 'Your check-in summary'}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={AppColors.outline} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  iconWell: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-start' },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.1,
    color: AppColors.onSurface,
  },
  meta: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
});
