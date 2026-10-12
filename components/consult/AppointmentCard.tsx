import { StyleSheet, Text, View } from 'react-native';

import { GradientButton } from '@/components/gradient-button';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';

export interface AppointmentCardProps {
  doctorName: string;
  doctorSpecialisation: string;
  hospital: string;
  date: string; // ISO date
  time: string;
  onViewDetails?: () => void;
  onCancel?: () => void;
  onJoinVideo?: () => void;
}

/**
 * Upcoming appointment: one hairline card. Avatar 36 + doctor 15 SemiBold +
 * specialty 13 muted, a plain meta line "12 Oct · 10:30 · Hospital" (no meta
 * icons), then Join video (primary md) with Details / Cancel as text buttons.
 */
export function AppointmentCard({
  doctorName,
  doctorSpecialisation,
  hospital,
  date,
  time,
  onViewDetails,
  onCancel,
  onJoinVideo,
}: AppointmentCardProps) {
  const d = new Date(date);
  const initials = doctorName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  const when = `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })} · ${time}`;
  const meta = hospital ? `${when} · ${hospital}` : when;

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.doctor} numberOfLines={1}>
            {doctorName}
          </Text>
          {doctorSpecialisation ? (
            <Text style={styles.spec} numberOfLines={1}>
              {doctorSpecialisation}
            </Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.when} numberOfLines={1}>
        {meta}
      </Text>
      {onJoinVideo || onViewDetails || onCancel ? (
        <View style={styles.actions}>
          {onJoinVideo ? <GradientButton label="Join video" onPress={onJoinVideo} size="md" style={styles.join} /> : null}
          {onViewDetails ? <GradientButton label="Details" onPress={onViewDetails} variant="ghost" /> : null}
          {onCancel ? <GradientButton label="Cancel" onPress={onCancel} variant="danger" /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
    gap: 12,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Size.iconWell / 2,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FontFamily.semibold, fontSize: 13, color: AppColors.primary },
  info: { flex: 1, gap: 2 },
  doctor: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  spec: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  when: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 22, color: AppColors.onSurface },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  join: { flexGrow: 1 },
});
