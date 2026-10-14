import { ReactNode, useEffect } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderIconButton } from '@/components/ScreenHeader';
import { AppColors, Radius } from '@/constants/theme';
import { typography } from '@/styles/global';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Pinned under the scrolling content (primary action). */
  footer?: ReactNode;
}

/**
 * Bottom sheet frame: scrim (tap to close), handle, title + close button,
 * scrolling body and an optional pinned footer. Closes on Android back and,
 * on web, on Escape. Shared by the growth log, "Mark given" and the child
 * switcher.
 */
export function Sheet({ visible, onClose, title, subtitle, children, footer }: SheetProps) {
  const insets = useSafeAreaInsets();

  // Escape closes the sheet on web (react-native-web has no back button).
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={styles.overlay}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={typography.heading} accessibilityRole="header">{title}</Text>
              {subtitle ? <Text style={typography.meta}>{subtitle}</Text> : null}
            </View>
            <HeaderIconButton icon="close" onPress={onClose} accessibilityLabel="Close" />
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: AppColors.overlay },
  sheet: {
    maxHeight: '90%',
    backgroundColor: AppColors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderCurve: 'continuous',
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: AppColors.outlineVariant,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 20,
    paddingRight: 8,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2, paddingTop: 6 },
  scroll: { flexGrow: 0 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 16 },
  footer: { paddingHorizontal: 20, paddingTop: 8, gap: 4 },
});
