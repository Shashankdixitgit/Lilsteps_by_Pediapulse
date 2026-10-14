import { StyleSheet, Text, View } from 'react-native';

import { AppColors, Radius } from '@/constants/theme';
import { typography } from '@/styles/global';

/** One block of a legal page: a heading, then bullets and/or paragraphs (bullets first). */
export interface LegalSection {
  heading: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
}

/**
 * Plain-English legal text (Terms of Service, Privacy Policy) in one white
 * card per section. Text only, so it reads well with large font sizes and
 * screen readers (each heading is a header for VoiceOver / TalkBack).
 */
export function LegalDocument({
  updated,
  intro,
  sections,
}: {
  /** e.g. "13 October 2026" */
  updated: string;
  intro?: string;
  sections: readonly LegalSection[];
}) {
  return (
    <View style={styles.doc}>
      <Text style={typography.caption}>Last updated {updated}</Text>
      {intro ? <Text style={typography.body}>{intro}</Text> : null}
      {sections.map((s, i) => (
        <View key={s.heading} style={styles.card}>
          <Text style={typography.title} accessibilityRole="header">
            {i + 1}. {s.heading}
          </Text>
          {s.bullets?.length ? (
            <View style={styles.bullets}>
              {s.bullets.map((b) => (
                <View key={b} style={styles.bulletRow}>
                  <Text style={[typography.bodySM, styles.dot]}>•</Text>
                  <Text style={[typography.bodySM, styles.bulletText]}>{b}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {s.paragraphs?.map((p) => (
            <Text key={p} style={typography.bodySM}>
              {p}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  doc: { gap: 12 },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
    gap: 8,
  },
  bullets: { gap: 6 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  dot: { color: AppColors.secondary },
  bulletText: { flex: 1 },
});
