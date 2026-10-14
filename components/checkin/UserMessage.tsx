import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';

/** The parent's answer. `failed`: it didn't reach the assistant (Retry resends it). */
export function UserMessage({ text, failed = false }: { text: string; failed?: boolean }) {
  return (
    <View style={styles.row}>
      <View
        style={[styles.bubble, failed && styles.bubbleFailed]}
        accessible
        accessibilityLabel={failed ? `You: ${text}. Not sent.` : `You: ${text}`}
      >
        <Text style={styles.text}>{text}</Text>
      </View>
      {failed ? (
        <View style={styles.status}>
          <Ionicons name="alert-circle" size={12} color={AppColors.danger} />
          <Text style={styles.statusText}>Not sent</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'flex-end', marginBottom: 16, gap: 4 },
  bubble: {
    maxWidth: '80%',
    backgroundColor: AppColors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bubbleFailed: { opacity: 0.6 },
  text: { fontFamily: 'Inter_400Regular', fontSize: 15, color: AppColors.onPrimary, lineHeight: 22 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 16, color: AppColors.danger },
});
