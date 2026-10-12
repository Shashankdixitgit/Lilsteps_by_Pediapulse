import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { AppColors } from '@/constants/theme';

const COLORS = [AppColors.mint, AppColors.sunshine, AppColors.peach, AppColors.sky, AppColors.secondary];

interface Piece {
  vx: number;
  vy: number;
  rot: number;
  color: string;
  round: boolean;
}

interface ConfettiProps {
  /** 0 -> 1 drives the whole burst (one shared value for every piece). */
  progress: SharedValue<number>;
  count?: number;
  /** Seed so the scatter pattern differs between bursts. */
  seed: number;
}

function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Lightweight confetti: 16-20 Animated.Views from a bottom-centre origin.
 * Transform + opacity only. Rendered by <Celebrate>, which skips it entirely
 * under reduced motion.
 */
export const Confetti = memo(function Confetti({ progress, count = 18, seed }: ConfettiProps) {
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        vx: (rand(seed + i) - 0.5) * 240,
        vy: -180 - rand(seed + i * 7) * 80 - 120,
        rot: (rand(seed + i * 13) - 0.5) * 720,
        color: COLORS[i % COLORS.length],
        round: i % 2 === 0,
      })),
    [count, seed],
  );

  return (
    <View pointerEvents="none" style={styles.origin}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} piece={p} progress={progress} />
      ))}
    </View>
  );
});

function ConfettiPiece({ piece, progress }: { piece: Piece; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = progress.get();
    // Ballistic arc: up fast, gravity pulls back down.
    const x = piece.vx * t * 1.6;
    const y = piece.vy * 1.9 * t + 520 * t * t;
    const opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
    return {
      opacity: t === 0 ? 0 : opacity,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${piece.rot * t}deg` }],
    };
  });
  return (
    <Animated.View
      style={[
        piece.round ? styles.dot : styles.rect,
        { backgroundColor: piece.color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  origin: {
    position: 'absolute',
    left: '50%',
    bottom: 180,
    width: 0,
    height: 0,
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rect: {
    position: 'absolute',
    width: 10,
    height: 5,
    borderRadius: 1.5,
  },
});
