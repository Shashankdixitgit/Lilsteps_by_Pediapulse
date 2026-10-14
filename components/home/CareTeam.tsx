import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { TextButton } from '@/components/gradient-button';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { typography } from '@/styles/global';

export interface CareProvider {
  id: string;
  name: string;
  role: string;
  initial: string;
}

interface CareTeamProps {
  providers: CareProvider[];
  onAddProvider?: () => void;
  onProviderPress?: (providerId: string) => void;
}

/**
 * Care team as compact rows inside one hairline card: 36 initial avatar,
 * name 15 SemiBold, role 13 muted, chevron. "Add a doctor" is a ghost text
 * button under the list. Same handlers as before.
 */
export function CareTeam({ providers, onAddProvider, onProviderPress }: CareTeamProps) {
  const { width, fontScale } = useWindowDimensions();
  const narrow = fontScale >= 1.3 || width / Math.max(fontScale, 1) < 340;
  return (
    <View style={styles.section}>
      <Text style={typography.headingSM}>Care team</Text>
      {providers.length > 0 ? (
        <View style={styles.card}>
          {providers.map((p, i) => (
            <PressableScale
              key={p.id}
              onPress={() => onProviderPress?.(p.id)}
              scaleTo={0.99}
              bg={AppColors.card}
              bgPressed={AppColors.surfaceContainerLow}
              accessibilityLabel={`${p.name}, ${p.role}`}
              style={[styles.row, i > 0 && styles.rowDivider]}
            >
              {/* Decorative initial: dropped at 200% zoom / narrow widths so the
                  name gets the room ("Dr. Madh av") (R3-05). */}
              {narrow ? null : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{p.initial}</Text>
                </View>
              )}
              <View style={styles.text}>
                <Text style={styles.name} numberOfLines={3}>
                  {p.name}
                </Text>
                <Text style={styles.role} numberOfLines={3}>
                  {p.role}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={AppColors.outline} />
            </PressableScale>
          ))}
        </View>
      ) : null}
      {onAddProvider ? (
        <TextButton label="Add a doctor" onPress={onAddProvider} chevron style={styles.add} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  avatar: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Size.iconWell / 2,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    color: AppColors.primary,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.onSurface,
  },
  role: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.muted,
  },
  add: {
    alignSelf: 'flex-start',
    paddingHorizontal: 0,
  },
});
