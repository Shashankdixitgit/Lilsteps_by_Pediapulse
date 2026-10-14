import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { GradientButton, TextButton } from '@/components/gradient-button';
import { StatusPill } from '@/components/ui/StatusPill';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';

import { canJoinVideo, CONSULT_MINUTES, doctorInitial, JOIN_OPENS_MINUTES, whenLabel } from './appointmentFormat';

export interface AppointmentCardProps {
  doctorName: string;
  doctorSpecialisation: string;
  date: string; // 'YYYY-MM-DD' (clinic date)
  time: string; // 'HH:MM[:SS]' (clinic time)
  onViewDetails?: () => void;
  onCancel?: () => void;
  /** Accessible name for Cancel (should name the doctor and the time). */
  cancelAccessibilityLabel?: string;
  cancelling?: boolean;
  onJoinVideo?: () => void;
  /**
   * Whether this consult has a video link (appointments.meet_link, or the
   * doctor's has_meet_link / has_google_calendar, 0035). false: no Join;
   * the card says the link is pending and offers Message doctor. Left
   * undefined (unknown), the button opens the video screen as "Open video",
   * which checks the link itself, so the card never promises a Join.
   */
  videoLinkReady?: boolean;
  /** Opens the chat with this doctor (used when the video link is pending). */
  onMessageDoctor?: () => void;
  /** The linked check-in summary said "seen today": show an Urgent tag. */
  urgent?: boolean;
  /** Opens the pre-visit (AI check-in) summary the doctor will read. */
  onViewSummary?: () => void;
  /** Test hook / clock injection; defaults to now. */
  now?: Date;
}

/**
 * Upcoming appointment: one hairline card. Avatar 36 (last-name initial) +
 * doctor 15 SemiBold + specialty 13 muted, the when line
 * "Today, 13 Oct · 2:00 PM", a "Video · 30 min" meta line, then Join video
 * (primary md) with Details / Cancel as text buttons. Join is only active
 * from JOIN_OPENS_MINUTES before the start; before that the card says when
 * it opens. Join shows only when a link exists (videoLinkReady); without
 * one the card reads "Video link pending · Message doctor".
 */
export function AppointmentCard({
  doctorName,
  doctorSpecialisation,
  date,
  time,
  onViewDetails,
  onCancel,
  cancelAccessibilityLabel,
  cancelling,
  onJoinVideo,
  videoLinkReady,
  onMessageDoctor,
  urgent,
  onViewSummary,
  now,
}: AppointmentCardProps) {
  const when = whenLabel(date, time, now);
  const joinOpen = canJoinVideo(date, time, now);
  const linkPending = videoLinkReady === false;
  const showVideoButton = !!onJoinVideo && !linkPending;
  const messageDoctor = onMessageDoctor ?? onJoinVideo;

  return (
    <View style={styles.card}>
      {/* R2-05: the Urgent pill sits under the name rather than beside it, so
          at 200% zoom the name keeps the full width instead of breaking one
          letter per line. */}
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{doctorInitial(doctorName)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.doctor}>{doctorName}</Text>
          {doctorSpecialisation ? <Text style={styles.spec}>{doctorSpecialisation}</Text> : null}
          {urgent ? (
            <View style={styles.pill}>
              <StatusPill tone="danger" label="Urgent" />
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.whenBlock}>
        <Text style={styles.when}>{when}</Text>
        <View style={styles.modeRow}>
          <Ionicons name="videocam-outline" size={14} color={AppColors.muted} />
          <Text style={styles.spec}>Video · {CONSULT_MINUTES} min</Text>
        </View>
      </View>
      {linkPending && onJoinVideo ? (
        <View style={styles.pendingRow}>
          <Ionicons name="videocam-off-outline" size={14} color={AppColors.muted} />
          <Text style={styles.spec}>Video link pending</Text>
          {messageDoctor ? (
            <>
              <Text style={styles.spec}>·</Text>
              <TextButton
                label="Message doctor"
                onPress={messageDoctor}
                style={styles.inlineLink}
                accessibilityLabel={`Video link pending. Message ${doctorName}`}
              />
            </>
          ) : null}
        </View>
      ) : null}
      {showVideoButton || onViewDetails || onCancel ? (
        <View style={styles.actions}>
          {showVideoButton && onJoinVideo ? (
            joinOpen ? (
              <GradientButton
                label={videoLinkReady ? 'Join video' : 'Open video'}
                onPress={onJoinVideo}
                size="md"
                style={styles.join}
                accessibilityLabel={`${videoLinkReady ? 'Join' : 'Open'} video consult with ${doctorName}`}
              />
            ) : (
              <GradientButton
                label="Video details"
                onPress={onJoinVideo}
                variant="outline"
                size="md"
                style={styles.join}
                accessibilityLabel={`Video consult with ${doctorName}. Join opens ${JOIN_OPENS_MINUTES} minutes before.`}
              />
            )
          ) : null}
          {onViewDetails ? <GradientButton label="Details" onPress={onViewDetails} variant="ghost" /> : null}
          {onCancel ? (
            <GradientButton
              label="Cancel"
              onPress={onCancel}
              variant="danger"
              loading={cancelling}
              disabled={cancelling}
              accessibilityLabel={cancelAccessibilityLabel ?? `Cancel consult with ${doctorName}, ${when}`}
            />
          ) : null}
        </View>
      ) : null}
      {showVideoButton && !joinOpen ? (
        <Text style={styles.hint}>Join opens {JOIN_OPENS_MINUTES} min before your consult.</Text>
      ) : null}
      {onViewSummary ? (
        <TextButton
          label="View pre-visit summary"
          onPress={onViewSummary}
          chevron
          style={styles.summaryLink}
        />
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
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pill: { flexDirection: 'row', marginTop: 4 },
  avatar: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Size.iconWell / 2,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FontFamily.semibold, fontSize: 13, color: AppColors.primary },
  info: { flex: 1, minWidth: 0, gap: 2 },
  doctor: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  spec: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  whenBlock: { gap: 2 },
  when: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 22, color: AppColors.onSurface },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  // maxWidth keeps a wrapped label (200% zoom) inside the card.
  join: { flexGrow: 1, flexShrink: 1, maxWidth: '100%' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  inlineLink: { paddingHorizontal: 0, marginVertical: -8 },
  summaryLink: { alignSelf: 'flex-start', paddingHorizontal: 0, marginVertical: -8 },
  hint: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: AppColors.muted },
});
