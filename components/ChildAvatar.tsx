import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Sprout } from '@/components/mascot/Sprout';
import { AppColors, ChildColors } from '@/constants/theme';

interface ChildAvatarProps {
  name?: string | null;
  photoUrl?: string | null;
  /** Sibling index (from a created_at-sorted copy of children). */
  colorIndex?: number;
  /** Fallback when index is unknown: derive a stable colour from the id. */
  id?: string;
  size?: number;
  /** Optional static progress arc (0..1). Only where the data is already loaded. */
  progress?: number;
}

function hashIndex(id?: string) {
  if (!id) return 0;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Child avatar with a colour ring in the child's own colour (accent purple, sunshine,
 * peach, sky by sibling order) and a white gap. Without a photo the child is
 * shown as Sprout, the app mascot, on the soft surface.
 */
export function ChildAvatar({ name, photoUrl, colorIndex, id, size = 40, progress }: ChildAvatarProps) {
  const palette = ChildColors[(colorIndex ?? hashIndex(id)) % ChildColors.length];
  const ring = 3;
  const gap = 2;
  const inner = size - (ring + gap) * 2;
  const hasProgress = typeof progress === 'number';
  const r = size / 2 - ring / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? `${name}'s avatar` : 'Child avatar'}
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: hasProgress ? 0 : ring,
          borderColor: palette.ring,
        },
      ]}
    >
      {hasProgress ? (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={AppColors.surfaceContainerHigh} strokeWidth={ring} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={AppColors.secondary}
            strokeWidth={ring}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * Math.max(0, Math.min(1, progress))} ${circumference}`}
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
      ) : null}
      <View
        style={[
          styles.inner,
          { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: palette.surface },
        ]}
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" />
        ) : (
          <Sprout mood="happy" size={Math.round(inner * 0.92)} style={styles.mascot} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.card,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mascot: { marginTop: 2 },
});

/** Stable sibling colour index: position in a created_at-sorted COPY (data untouched). */
export function childColorIndex(
  children: readonly { id: string; created_at?: string | null }[],
  id: string | undefined,
): number | undefined {
  if (!id) return undefined;
  const sorted = [...children].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const idx = sorted.findIndex((c) => c.id === id);
  return idx === -1 ? undefined : idx;
}
