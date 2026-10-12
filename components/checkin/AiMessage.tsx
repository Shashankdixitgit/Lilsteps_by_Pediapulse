import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SproutArt } from '@/components/mascot/Sprout';
import { AppColors } from '@/constants/theme';

export interface AiMessageProps {
  text: string;
  quickOptions?: string[];
  onOptionTap?: (option: string) => void;
}

export function AiMessage({ text, quickOptions, onOptionTap }: AiMessageProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.avatar} accessible={false} importantForAccessibility="no-hide-descendants">
          <SproutArt mood="happy" size={26} />
        </View>
        <View style={styles.content}>
          <Text style={styles.text}>{text}</Text>
        </View>
      </View>
      {quickOptions && quickOptions.length > 0 ? (
        <View style={styles.optionsRow}>
          {quickOptions.map((opt) => (
            <Pressable
              key={opt}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              accessibilityRole="button"
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
  text: { fontFamily: 'Inter_400Regular', fontSize: 15, color: AppColors.onSurface, lineHeight: 22 },
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
