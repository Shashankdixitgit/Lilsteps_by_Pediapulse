import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppColors, FontFamily, Size } from '@/constants/theme';
import { doctorInitial } from './appointmentFormat';

export interface DoctorAvatarProps {
  name: string | null | undefined;
  /** doctors.avatar_url — a plain identification headshot; the initial shows until it loads or if it fails. */
  avatarUrl?: string | null;
  size?: number;
  /** Rows already say the doctor's name next to the avatar, so it is hidden from screen readers by default. */
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The doctor's photo in a circle, with their initial ("Dr. Madhav Chavan" -> "M")
 * as the fallback. Used everywhere the parent app shows a doctor.
 */
export function DoctorAvatar({ name, avatarUrl, size = Size.iconWell, decorative = true, style }: DoctorAvatarProps) {
  const [failed, setFailed] = useState(false);
  // A recycled row may get a new URL: try the photo again.
  useEffect(() => setFailed(false), [avatarUrl]);
  const showPhoto = !!avatarUrl && !failed;
  const box = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View
      style={[styles.circle, box, style]}
      accessible={!decorative}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : `${name ?? 'Doctor'}'s photo`}
    >
      <Text style={[styles.initial, { fontSize: Math.round(size * 0.42) }]}>{doctorInitial(name)}</Text>
      {showPhoto ? (
        <Image
          source={{ uri: avatarUrl }}
          style={[StyleSheet.absoluteFill, box]}
          contentFit="cover"
          contentPosition="top"
          transition={150}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: { fontFamily: FontFamily.semibold, color: AppColors.primary },
});
