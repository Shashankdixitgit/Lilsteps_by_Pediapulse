import { Ionicons } from '@expo/vector-icons';
import { Card } from 'heroui-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';

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
  const initials = doctorName.split(' ').map((w) => w[0]).join('').slice(0, 2);

  return (
    <Card style={styles.card}>
      <Card.Body style={styles.body}>
        <View style={styles.accent} />
        <View style={styles.top}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.doctor}>{doctorName}</Text>
            <Text style={styles.spec}>{doctorSpecialisation}</Text>
          </View>
          <View style={styles.dateBadge}>
            <Text style={styles.dateDay}>{d.getDate()}</Text>
            <Text style={styles.dateMonth}>{d.toLocaleDateString('en-US', { month: 'short' })}</Text>
          </View>
        </View>
        <View style={styles.details}>
          <View style={styles.meta}>
            <Ionicons name="time-outline" size={14} color={AppColors.onSurfaceVariant} />
            <Text style={styles.metaText}>{time}</Text>
          </View>
          <View style={styles.meta}>
            <Ionicons name="location-outline" size={14} color={AppColors.onSurfaceVariant} />
            <Text style={styles.metaText}>{hospital}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          {onJoinVideo && (
            <Pressable
              style={({ pressed }) => [styles.joinBtn, { opacity: pressed ? 0.85 : 1 }]}
              onPress={onJoinVideo}
            >
              <Ionicons name="videocam" size={14} color={AppColors.onPrimary} />
              <Text style={styles.joinText}>Join video</Text>
            </Pressable>
          )}
          {onViewDetails && (
            <Pressable
              style={({ pressed }) => [styles.viewBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={onViewDetails}
            >
              <Text style={styles.viewText}>Details</Text>
            </Pressable>
          )}
          {onCancel && (
            <Pressable
              style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={onCancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          )}
        </View>
      </Card.Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: AppColors.surfaceContainerLowest, borderRadius: 16, overflow: 'hidden' },
  body: { padding: 16, gap: 14 },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: AppColors.primary,
    borderRadius: 2,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${AppColors.primaryContainer}50`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: AppColors.primary },
  info: { flex: 1, gap: 2 },
  doctor: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: AppColors.onSurface },
  spec: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: AppColors.onSurfaceVariant },
  dateBadge: {
    backgroundColor: `${AppColors.primary}10`,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  dateDay: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 18, color: AppColors.primary },
  dateMonth: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, color: AppColors.primary },
  details: { flexDirection: 'row', gap: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: AppColors.onSurfaceVariant },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: AppColors.primary,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    flexGrow: 1,
    flexBasis: '40%',
  },
  joinText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: AppColors.onPrimary },
  viewBtn: {
    flex: 1,
    backgroundColor: `${AppColors.primary}10`,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  viewText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: AppColors.primary },
  cancelBtn: {
    flex: 1,
    backgroundColor: AppColors.surfaceContainerHigh,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: AppColors.onSurfaceVariant },
});
