import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Size } from '@/constants/theme';
import { formatDate } from '@/lib/date';

import { doctorInitial } from './appointmentFormat';

export interface ConversationListItemProps {
  id: string;
  doctorName: string;
  /** Last message text, or null for a thread with no messages yet. */
  preview: string | null;
  /** True when the last message was sent by the parent. */
  previewFromParent?: boolean;
  /** ISO timestamp of the last activity. */
  lastAt: string | null;
  unread: number;
  onPress: (id: string) => void;
  /** Hairline top divider when stacked inside one parent list card. */
  divider?: boolean;
}

/** "14:05" style for today, "13 Oct" otherwise (en-IN, device time). */
function shortStamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    : formatDate(d, { now });
}

/**
 * Doctor thread as a list row (inside one parent card): 36 initial avatar,
 * doctor 15 SemiBold, 1-line preview 13 muted, time on the right and an
 * unread count pill. Mirrors ConsultHistoryItem.
 */
export function ConversationListItem({
  id,
  doctorName,
  preview,
  previewFromParent,
  lastAt,
  unread,
  onPress,
  divider,
}: ConversationListItemProps) {
  const stamp = shortStamp(lastAt);
  const previewText = preview ? `${previewFromParent ? 'You: ' : ''}${preview}` : 'No messages yet';
  const label = [
    `Chat with ${doctorName}`,
    unread > 0 ? `${unread} unread` : null,
    preview ? previewText : null,
    stamp || null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <PressableScale
      onPress={() => onPress(id)}
      scaleTo={0.99}
      bg={AppColors.card}
      bgPressed={AppColors.surfaceContainerLow}
      accessibilityLabel={label}
      style={[styles.row, divider && styles.divider]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{doctorInitial(doctorName)}</Text>
      </View>
      <View style={styles.info}>
        <View style={styles.topLine}>
          <Text style={styles.name}>{doctorName}</Text>
          {stamp ? <Text style={styles.stamp}>{stamp}</Text> : null}
        </View>
        <View style={styles.topLine}>
          <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
            {previewText}
          </Text>
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={Size.iconRow} color={AppColors.outlineVariant} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AppColors.border },
  avatar: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Size.iconWell / 2,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FontFamily.semibold, fontSize: 13, color: AppColors.primary },
  info: { flex: 1, minWidth: 0, gap: 2 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, minWidth: 0, fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  stamp: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: AppColors.muted },
  preview: { flex: 1, minWidth: 0, fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  previewUnread: { fontFamily: FontFamily.semibold, color: AppColors.onSurface },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: FontFamily.semibold, fontSize: 12, lineHeight: 16, color: AppColors.onPrimary },
});
