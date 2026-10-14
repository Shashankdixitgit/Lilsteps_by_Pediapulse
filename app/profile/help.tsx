import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsCard, SettingsRow } from '@/components/settings-row';
import { AppColors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { callNumber, emailSupport, EMERGENCY_NUMBER, SUPPORT_EMAIL } from '@/lib/support';
import { layout, typography } from '@/styles/global';

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Help & support" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Safety first: LilSteps is not for emergencies. */}
        <View style={layout.section}>
          <Text style={styles.sectionLabel}>Emergency</Text>
          <SettingsCard>
            <SettingsRow
              icon="call-outline"
              tone="danger"
              title={`Call ${EMERGENCY_NUMBER}`}
              detail="Trouble breathing, a seizure, or your child is hard to wake: call now or go to the nearest hospital."
              chevron
              onPress={() => void callNumber(EMERGENCY_NUMBER)}
              accessibilityLabel={`Call emergency number ${EMERGENCY_NUMBER}`}
            />
          </SettingsCard>
        </View>

        <View style={layout.section}>
          <Text style={styles.sectionLabel}>Contact the LilSteps team</Text>
          <SettingsCard>
            <SettingsRow
              icon="mail-outline"
              title="Email us"
              detail={SUPPORT_EMAIL}
              chevron
              onPress={() =>
                void emailSupport('Help with LilSteps', `\n\nAccount ID: ${user?.id ?? 'unknown'}`)
              }
              accessibilityHint="Opens your email app"
            />
          </SettingsCard>
          <Text style={[typography.caption, styles.note]}>
            For questions about the app, bookings or your account. For medical questions, book a
            consult with a pediatrician.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },
  sectionLabel: {
    ...typography.sectionLabel,
    color: AppColors.muted,
    marginLeft: 4,
  },
  note: { marginLeft: 4 },
});
