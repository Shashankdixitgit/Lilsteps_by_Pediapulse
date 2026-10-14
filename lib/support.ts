import { Alert, Linking } from 'react-native';

/**
 * Where parents reach the LilSteps team (Help & support, account deletion).
 * TODO(launch): confirm this mailbox exists and is monitored before go-live.
 */
export const SUPPORT_EMAIL = 'support@pediapulse.in';

/** India's single emergency number. */
export const EMERGENCY_NUMBER = '112';

/**
 * Open the parent's mail app with a message to support. If no mail app can
 * handle it, show the address so the parent can write from anywhere.
 */
export async function emailSupport(subject: string, body = ''): Promise<void> {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('No email app found', `Please write to us at ${SUPPORT_EMAIL}.`);
  }
}

export async function callNumber(number: string): Promise<void> {
  try {
    await Linking.openURL(`tel:${number}`);
  } catch {
    Alert.alert('Could not start the call', `Please dial ${number} from your phone.`);
  }
}
