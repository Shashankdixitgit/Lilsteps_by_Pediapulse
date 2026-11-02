import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';

/** Back gestures and the back button send one of these; the app's own replace/navigate do not. */
const BACK_ACTIONS = new Set(['GO_BACK', 'POP', 'POP_TO_TOP']);

export function isBackAction(type: string | undefined): boolean {
  return !!type && BACK_ACTIONS.has(type);
}

type Action = { type: string };

/**
 * Android back, iPhone swipe-back and the header arrow during a state where
 * going back is wrong (review should-fix 18):
 *  - 'wait': going back does nothing (e.g. while the check-in summary is
 *    being made);
 *  - 'home': go Home instead of stepping back into a finished flow (after
 *    "You're booked", back must not reopen the booking screens).
 * The screen's own navigation (replace to the summary, "Message doctor") is
 * let through.
 */
export function useBackGuard(active: boolean, mode: 'wait' | 'home') {
  const navigation = useNavigation();
  const [pass, setPass] = useState<Action | null>(null);
  const [goHome, setGoHome] = useState(false);

  usePreventRemove(active && !pass && !goHome, ({ data }) => {
    if (!isBackAction(data.action.type)) setPass(data.action as Action);
    else if (mode === 'home') setGoHome(true);
  });

  useEffect(() => {
    // Prevention is off now: let the screen's own action happen.
    if (pass) navigation.dispatch(pass as never);
  }, [pass, navigation]);

  useEffect(() => {
    if (goHome) router.replace('/(tabs)');
  }, [goHome]);
}
