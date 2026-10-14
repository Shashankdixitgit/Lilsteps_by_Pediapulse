import { Ionicons } from '@expo/vector-icons';
import { Linking, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { AppColors, FontFamily } from '@/constants/theme';

export type MessageSender = 'parent' | 'doctor';

/** https links only (a Meet link, a lab page); trailing punctuation stays text. */
const URL_RE = /https:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

function openLink(url: string) {
  Linking.openURL(url).catch(() => {});
}

/**
 * Message text with https URLs as tappable links (R2-14), so a Meet link a
 * doctor sends can be opened without copying it by hand.
 */
function LinkifiedText({ content, style, linkStyle }: { content: string; style: TextStyle; linkStyle: TextStyle }) {
  const parts: { text: string; url: boolean }[] = [];
  let last = 0;
  for (const m of content.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: content.slice(last, start), url: false });
    parts.push({ text: m[0], url: true });
    last = start + m[0].length;
  }
  if (last < content.length) parts.push({ text: content.slice(last), url: false });
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.url ? (
          <Text
            key={i}
            style={linkStyle}
            onPress={() => openLink(p.text)}
            accessibilityRole="link"
            accessibilityHint="Opens the link"
          >
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}

export function MessageBubble({
  sender,
  content,
  timestamp,
}: {
  sender: MessageSender;
  content: string;
  timestamp?: string;
}) {
  if (sender === 'parent') {
    return (
      <View style={styles.parentRow}>
        <View style={styles.parentBubble}>
          <LinkifiedText content={content} style={styles.parentText} linkStyle={styles.parentLink} />
        </View>
        {!!timestamp && <Text style={styles.parentTime}>{timestamp}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.doctorContainer}>
      <View style={styles.doctorRow}>
        <View style={styles.avatar}>
          <Ionicons name="medkit-outline" size={16} color={AppColors.primary} />
        </View>
        <View style={styles.doctorBubble}>
          <LinkifiedText content={content} style={styles.doctorText} linkStyle={styles.doctorLink} />
        </View>
      </View>
      {!!timestamp && <Text style={styles.doctorTime}>{timestamp}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  parentRow: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  parentBubble: {
    maxWidth: '80%',
    backgroundColor: AppColors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  parentText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: AppColors.onPrimary,
    lineHeight: 22,
  },
  parentLink: { color: AppColors.onPrimary, textDecorationLine: 'underline', fontFamily: FontFamily.medium },
  parentTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: AppColors.muted,
    marginTop: 4,
    marginRight: 4,
  },

  doctorContainer: { marginBottom: 16 },
  doctorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.greenWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  doctorBubble: {
    maxWidth: '80%',
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  doctorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: AppColors.onSurface,
    lineHeight: 22,
  },
  doctorLink: { color: AppColors.secondary, textDecorationLine: 'underline', fontFamily: FontFamily.medium },
  doctorTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: AppColors.muted,
    marginTop: 4,
    marginLeft: 40,
  },
});
