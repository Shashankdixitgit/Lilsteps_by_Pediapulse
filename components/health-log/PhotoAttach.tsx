import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';

export interface PhotoAttachProps {
  uri: string | null;
  onChange: (next: { uri: string; mime: string } | null) => void;
}

export function PhotoAttach({ uri, onChange }: PhotoAttachProps) {
  async function handlePick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo access to attach an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    onChange({ uri: asset.uri, mime: asset.mimeType ?? 'image/jpeg' });
  }

  if (uri) {
    return (
      <View style={styles.previewRow}>
        <Image source={{ uri }} style={styles.preview} contentFit="cover" />
        <View style={styles.meta}>
          <Text style={styles.metaText}>Photo attached</Text>
          <Text style={styles.metaSub}>Will upload when you save</Text>
        </View>
        <Pressable style={styles.remove} onPress={() => onChange(null)} hitSlop={10} accessibilityLabel="Remove photo">
          <Ionicons name="close" size={16} color={AppColors.onSurface} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable style={styles.attachRow} onPress={handlePick}>
      <Ionicons name="camera-outline" size={18} color={AppColors.secondary} />
      <Text style={styles.attachText}>Attach photo (optional)</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    minHeight: 44,
  },
  attachText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: AppColors.secondary },

  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 12,
  },
  preview: { width: 56, height: 56, borderRadius: 10, backgroundColor: AppColors.surfaceContainerHigh },
  meta: { flex: 1, gap: 2 },
  metaText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: AppColors.onSurface },
  metaSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: AppColors.muted },
  remove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
