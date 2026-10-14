import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SproutArt } from '@/components/mascot/Sprout';
import { AppColors, FontFamily } from '@/constants/theme';

export interface AiMessageProps {
  text: string;
  quickOptions?: string[];
  onOptionTap?: (option: string) => void;
}

type Run = { text: string; bold: boolean };

/** Splits one line on **bold** / __bold__ markers; stray single * or _ emphasis is dropped. */
function parseInline(line: string): Run[] {
  const runs: Run[] = [];
  const re = /(\*\*|__)(.+?)\1/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) runs.push({ text: line.slice(last, m.index), bold: false });
    runs.push({ text: m[2], bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) runs.push({ text: line.slice(last), bold: false });
  // *italic* / _italic_ → plain text (Inter has no italic in the type scale).
  return runs.map((r) => ({ ...r, text: r.text.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s.,!?:;)]|$)/g, '$1$2') }));
}

/**
 * Light markdown for AI replies: **bold**, bullet lines ("- ", "* ", "• ",
 * "1. ") and "#" headings. Anything else renders as plain text, so the
 * parent never sees literal asterisks.
 */
function MarkdownText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return (
    <View style={styles.md}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return null;
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
        const ordered = /^\s*(\d+)[.)]\s+/.exec(line);
        const body = heading ? heading[1] : bullet ? bullet[1] : line;
        const runs = parseInline(body);
        const content = runs.map((r, j) => (
          <Text key={j} style={r.bold || heading ? styles.bold : undefined}>
            {r.text}
          </Text>
        ));
        if (bullet) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.text}>{ordered ? `${ordered[1]}.` : '•'}</Text>
              <Text style={[styles.text, styles.bulletText]}>{content}</Text>
            </View>
          );
        }
        return (
          <Text key={i} style={styles.text}>
            {content}
          </Text>
        );
      })}
    </View>
  );
}

/** Plain text for screen readers: markdown markers removed. */
function spokenText(text: string): string {
  return text
    .replace(/(\*\*|__)/g, '')
    .replace(/^\s*(?:[-*•#]+)\s+/gm, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
}

export function AiMessage({ text, quickOptions, onOptionTap }: AiMessageProps) {
  return (
    <View style={styles.container}>
      {/* One stop per message for screen readers, naming the sender. */}
      <View style={styles.row} accessible accessibilityLabel={`LilSteps assistant: ${spokenText(text)}`}>
        <View style={styles.avatar} accessible={false} importantForAccessibility="no-hide-descendants">
          <SproutArt mood="happy" size={26} />
        </View>
        <View style={styles.content}>
          <MarkdownText text={text} />
        </View>
      </View>
      {quickOptions && quickOptions.length > 0 ? (
        <View style={styles.optionsRow}>
          {quickOptions.map((opt) => (
            <Pressable
              key={opt}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              accessibilityRole="button"
              // R2-22: a real name (react-native-web otherwise rendered aria-label="").
              accessibilityLabel={`Answer: ${opt}`}
              aria-label={`Answer: ${opt}`}
              accessibilityHint="Sends this answer"
              onPress={() => onOptionTap?.(opt)}
            >
              <Text style={styles.chipText}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  content: { flex: 1, paddingRight: 40 },
  md: { gap: 6 },
  text: { fontFamily: FontFamily.regular, fontSize: 15, color: AppColors.onSurface, lineHeight: 22 },
  bold: { fontFamily: FontFamily.semibold },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletText: { flex: 1, minWidth: 0 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingLeft: 44 },
  chipPressed: { backgroundColor: AppColors.mintSurface },
  chip: {
    paddingHorizontal: 14,
    minHeight: 34,
    paddingVertical: 7,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppColors.borderStrong,
    backgroundColor: AppColors.surfaceContainerLowest,
  },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: AppColors.onSurface },
});
