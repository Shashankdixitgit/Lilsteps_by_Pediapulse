/**
 * Web version of lib/confirm (same API): an in-app dialog in the design
 * system instead of the browser's window.confirm / window.alert.
 *
 * The dialog renders into its own root on document.body, so any screen,
 * hook or helper can await it without a provider. While it is open the app
 * behind it is inert (no clicks, no Tab focus), Escape or a click on the
 * scrim cancels, and focus returns to where it was when it closes.
 */
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GradientButton, TextButton } from '@/components/gradient-button';
import { AppColors, Radius, Shadow } from '@/constants/theme';
import { typography } from '@/styles/global';

import type { ConfirmOptions } from './confirm';

export type { ConfirmOptions } from './confirm';

// react-dom ships with Expo web; it has no bundled types in this project.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRoot } = require('react-dom/client') as {
  createRoot: (el: Element) => { render: (node: ReactNode) => void; unmount: () => void };
};

interface DialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  /** null = one-button message (notify). */
  cancelLabel: string | null;
  destructive: boolean;
  onClose: (confirmed: boolean) => void;
}

function Dialog({ title, message, confirmLabel, cancelLabel, destructive, onClose }: DialogProps) {
  const cardRef = useRef<View>(null);
  const id = `ls-dialog-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const titleId = `${id}-title`;
  const messageId = `${id}-message`;

  useEffect(() => {
    // Focus the safe choice: Cancel when there is one (a stray Enter must not
    // delete anything), else the only button.
    const card = cardRef.current as unknown as HTMLElement | null;
    const buttons = card?.querySelectorAll<HTMLElement>('[role="button"]');
    if (buttons && buttons.length > 0) buttons[0].focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(cancelLabel === null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cancelLabel, onClose]);

  return (
    <View style={styles.scrim}>
      {/* Scrim click = Cancel. Not a tab stop; Escape does the same. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => onClose(cancelLabel === null)}
        focusable={false}
        accessible={false}
      />
      <View
        ref={cardRef}
        style={styles.card}
        role={cancelLabel === null ? 'dialog' : 'alertdialog'}
        aria-modal
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <Text nativeID={titleId} style={typography.headingSM} role="heading">
          {title}
        </Text>
        <Text nativeID={messageId} style={[typography.body, styles.message]}>
          {message}
        </Text>
        <View style={styles.actions}>
          {cancelLabel !== null ? <TextButton label={cancelLabel} onPress={() => onClose(false)} /> : null}
          {destructive ? (
            <TextButton label={confirmLabel} tone="danger" onPress={() => onClose(true)} />
          ) : (
            <GradientButton label={confirmLabel} showArrow={false} onPress={() => onClose(true)} />
          )}
        </View>
      </View>
    </View>
  );
}

function openDialog(props: Omit<DialogProps, 'onClose'>): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.setAttribute('data-lilsteps-dialog', '');
    Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '2147483000', display: 'flex' });
    document.body.appendChild(host);

    // Make everything behind the dialog unreachable (mouse, Tab, screen
    // reader): the app root and any open sheet (react-native-web renders a
    // Modal in its own node on body).
    const madeInert = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el !== host && el instanceof HTMLElement && !el.hasAttribute('inert'),
    );
    madeInert.forEach((el) => el.setAttribute('inert', ''));
    // An open react-native-web Modal traps focus with a document-level
    // listener that would pull focus out of this dialog; stop it first.
    const keepFocus = (e: FocusEvent) => {
      if (e.target instanceof Node && host.contains(e.target)) e.stopImmediatePropagation();
    };
    window.addEventListener('focus', keepFocus, true);
    const previousFocus = document.activeElement as HTMLElement | null;

    const root = createRoot(host);
    let done = false;
    const close = (confirmed: boolean) => {
      if (done) return;
      done = true;
      root.unmount();
      host.remove();
      window.removeEventListener('focus', keepFocus, true);
      madeInert.forEach((el) => el.removeAttribute('inert'));
      previousFocus?.focus?.();
      resolve(confirmed);
    };
    root.render(<Dialog {...props} onClose={close} />);
  });
}

export function confirmAsync(
  title: string,
  message: string,
  { confirmLabel = 'OK', cancelLabel = 'Cancel', destructive = false }: ConfirmOptions = {},
): Promise<boolean> {
  return openDialog({ title, message, confirmLabel, cancelLabel, destructive });
}

/** A one-button message. Resolves when it is dismissed. */
export async function notify(title: string, message: string): Promise<void> {
  await openDialog({ title, message, confirmLabel: 'OK', cancelLabel: null, destructive: false });
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: AppColors.overlay,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    gap: 8,
    padding: 24,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.card,
    boxShadow: Shadow.raised,
  },
  message: { color: AppColors.onSurfaceVariant },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    columnGap: 8,
    rowGap: 4,
    marginTop: 12,
  },
});
