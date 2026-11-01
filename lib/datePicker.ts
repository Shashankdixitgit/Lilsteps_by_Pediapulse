/**
 * The date a native date picker event really chose, or null.
 *
 * @react-native-community/datetimepicker calls onChange on Android when the
 * parent taps Cancel too: the event type is 'dismissed' and the date is the
 * picker's starting value (often today). Treating that as a choice set a
 * child's birthday to today (mobile review 1 Nov 2026, must-fix 2). Only a
 * 'set' event with a date counts.
 */
export function pickedDate(event: { type?: string } | null | undefined, date: Date | undefined | null): Date | null {
  if (!event || event.type !== 'set' || !date) return null;
  return date;
}
