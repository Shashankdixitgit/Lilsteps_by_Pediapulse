import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';

export type MessageSender = 'parent' | 'doctor';

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
          <Text style={styles.parentText}>{content}</Text>
        </View>
        {timestamp && <Text style={styles.parentTime}>{timestamp}</Text>}
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
          <Text style={styles.doctorText}>{content}</Text>
        </View>
      </View>
      {timestamp && <Text style={styles.doctorTime}>{timestamp}</Text>}
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
    paddingVertical: 12,
  },
  parentText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 16,
    color: AppColors.onPrimary,
    lineHeight: 24,
  },
  parentTime: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    color: AppColors.onSurfaceVariant,
    marginTop: 4,
    marginRight: 4,
  },

  doctorContainer: { marginBottom: 16 },
  doctorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${AppColors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  doctorBubble: {
    maxWidth: '80%',
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  doctorText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 16,
    color: AppColors.onSurface,
    lineHeight: 24,
  },
  doctorTime: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    color: AppColors.onSurfaceVariant,
    marginTop: 4,
    marginLeft: 40,
  },
});
