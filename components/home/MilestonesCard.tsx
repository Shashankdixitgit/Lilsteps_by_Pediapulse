import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { TextButton } from '@/components/gradient-button';
import { useCompactWidth } from '@/components/home/useCompactWidth';
import { milestoneActEarlyNote, type MilestoneBand } from '@/constants/milestones';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';

/** Items shown before "Show all". */
const PREVIEW_COUNT = 3;

interface MilestonesCardProps {
  band: MilestoneBand;
  childName: string;
  /** Loads the parent's onboarding ticks (children.onboarding_answers). */
  childId: string | null;
}

/**
 * Milestones the parent ticked in onboarding (path A, a-milestones), read
 * from children.onboarding_answers.raw.aMilestones.achieved (0031). The
 * ticks are the checklist's own wording, so they match the band's items by
 * text; once the child moves to the next band, nothing matches and the
 * card shows the plain checklist again.
 */
function useOnboardingTicks(childId: string | null) {
  // Keyed by child, so a switch never shows the previous child's ticks.
  const [loaded, setLoaded] = useState<{ childId: string; ticks: string[] } | null>(null);
  useEffect(() => {
    let alive = true;
    if (!childId) return;
    supabase
      .from('children')
      .select('onboarding_answers')
      .eq('id', childId)
      .maybeSingle()
      .then(({ data }) => {
        const raw = (data?.onboarding_answers as { raw?: { aMilestones?: { achieved?: unknown } } } | null)?.raw;
        const achieved = raw?.aMilestones?.achieved;
        const ticks = Array.isArray(achieved) ? achieved.filter((a): a is string => typeof a === 'string') : [];
        if (alive) setLoaded({ childId, ticks });
      });
    return () => {
      alive = false;
    };
  }, [childId]);
  return loaded && loaded.childId === childId ? loaded.ticks : [];
}

/**
 * Home card: what most children do at the child's age (constants/milestones,
 * C4). Read-only checkpoints, never a score; a short preview that expands.
 * Items the parent ticked during sign-up show a check.
 */
export function MilestonesCard({ band, childName, childId }: MilestonesCardProps) {
  const [expanded, setExpanded] = useState(false);
  const ticks = useOnboardingTicks(childId);
  const compact = useCompactWidth();
  const ticked = new Set(band.items.filter((i) => ticks.includes(i.text)).map((i) => i.text));
  const items = expanded ? band.items : band.items.slice(0, PREVIEW_COUNT);
  const hidden = band.items.length - PREVIEW_COUNT;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {compact ? null : (
          <View style={styles.iconWell}>
            <Ionicons name="flag-outline" size={Size.iconRow} color={AppColors.sunshineText} />
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title}>{band.label}</Text>
          <Text style={typography.meta}>What most children can do</Text>
          {ticked.size > 0 ? (
            <Text style={typography.meta}>
              You ticked {ticked.size} of {band.items.length} when you joined
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.list} role="list">
        {items.map((item) => {
          const done = ticked.has(item.text);
          return (
            <View
              key={item.text}
              style={styles.row}
              role="listitem"
              // Native reads the row as one item; web keeps it a plain li
              // (the DOM has no "accessible" attribute).
              {...(Platform.OS === 'web' ? null : { accessible: true })}
              accessibilityLabel={done ? `${item.text}. Ticked when you joined` : item.text}
            >
              {done ? (
                <Ionicons name="checkmark-circle" size={16} color={AppColors.secondary} style={styles.check} />
              ) : (
                <View style={styles.dot} />
              )}
              <Text style={[typography.bodySM, styles.rowText]}>{item.text}</Text>
            </View>
          );
        })}
      </View>

      {hidden > 0 ? (
        <TextButton
          label={expanded ? 'Show less' : `Show all ${band.items.length}`}
          onPress={() => setExpanded((v) => !v)}
          style={styles.toggle}
          accessibilityLabel={expanded ? 'Show fewer milestones' : `Show all ${band.items.length} milestones`}
        />
      ) : null}

      <Text style={typography.meta}>{milestoneActEarlyNote(childName)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.card,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWell: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.sunshineSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.1,
    color: AppColors.onSurface,
  },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    backgroundColor: AppColors.secondary,
  },
  check: { marginTop: 2 },
  rowText: { flex: 1, minWidth: 0, color: AppColors.onSurface },
  toggle: { alignSelf: 'flex-start', marginVertical: -8, marginLeft: -8 },
});
