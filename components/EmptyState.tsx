import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { GradientButton } from '@/components/gradient-button';
import { Sprout, SproutMood } from '@/components/mascot/Sprout';
import { AppColors, FontFamily, Radius } from '@/constants/theme';

interface EmptyStateProps {
  title: string;
  body?: string;
  mood?: SproutMood;
  /** Small prop object next to Sprout (Ionicons name), e.g. 'folder-open', 'calendar'. */
  prop?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  /** Render inside a white bordered card (default) or bare. */
  card?: boolean;
  /**
   * Compact one-liner for empty sections inside a populated screen: no Sprout,
   * no blob, title 15 SemiBold + 13 body, centred, paddingVertical 16.
   */
  compact?: boolean;
}

/**
 * Friendly empty state: static Sprout + one prop on a soft green blob, a title,
 * up to two lines of body and an optional action. Replaces the old icon-only
 * empty cards.
 */
export function EmptyState({
  title,
  body,
  mood = 'happy',
  prop,
  actionLabel,
  onAction,
  card = true,
  compact,
}: EmptyStateProps) {
  if (compact) {
    return (
      <View style={[styles.compactWrap, card && styles.card]}>
        <Text style={styles.compactTitle}>{title}</Text>
        {body ? (
          <Text style={styles.compactBody} numberOfLines={2}>
            {body}
          </Text>
        ) : null}
        {actionLabel && onAction ? (
          <GradientButton label={actionLabel} onPress={onAction} variant="ghost" />
        ) : null}
      </View>
    );
  }
  return (
    <View style={[styles.wrap, card && styles.card]}>
      <View style={styles.scene}>
        <View style={styles.blob} />
        <Sprout mood={mood} size={64} />
        {prop ? (
          <View style={styles.prop} accessible={false} importantForAccessibility="no-hide-descendants">
            <Ionicons name={prop} size={14} color={AppColors.primary} />
          </View>
        ) : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? (
        <Text style={styles.body} numberOfLines={2}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <GradientButton label={actionLabel} onPress={onAction} size="md" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    gap: 4,
  },
  compactWrap: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 2,
  },
  compactTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.onSurface,
    textAlign: 'center',
  },
  compactBody: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.muted,
    textAlign: 'center',
    maxWidth: 300,
  },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  scene: {
    width: 96,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  blob: {
    position: 'absolute',
    width: 96,
    height: 76,
    borderRadius: 48,
    backgroundColor: AppColors.greenWash,
  },
  prop: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.sunshineSurface,
    borderWidth: 1.5,
    borderColor: AppColors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: AppColors.onSurface,
    textAlign: 'center',
  },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 300,
  },
  action: {
    marginTop: 8,
    alignSelf: 'center',
  },
});
