import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiMessage } from '@/components/checkin/AiMessage';
import { CHECKIN_HEADER_HEIGHT, CheckinHeader } from '@/components/checkin/CheckinHeader';
import { TypingIndicator } from '@/components/checkin/TypingIndicator';
import { UserMessage } from '@/components/checkin/UserMessage';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { GradientButton } from '@/components/gradient-button';
import { AppColors, CanvasFade } from '@/constants/theme';
import { typography } from '@/styles/global';
import { useChild } from '@/context/child';
import { useCheckin } from '@/hooks/useCheckin';

export default function CheckinChatScreen() {
  const insets = useSafeAreaInsets();
  const { complaint } = useLocalSearchParams<{ complaint: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const { child } = useChild();
  const checkin = useCheckin(child);
  const [inputText, setInputText] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (complaint && !started) {
      setStarted(true);
      checkin.startCheckin(complaint).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complaint]);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(timer);
  }, [checkin.messages, checkin.loading]);

  async function sendReply(overrideText?: string) {
    const text = (overrideText ?? inputText).trim();
    if (!text || checkin.loading) return;
    setInputText('');
    try {
      await checkin.sendMessage(text);
    } catch {
      // handled in hook
    }
  }

  async function handleGenerateSummary() {
    setGeneratingSummary(true);
    try {
      await checkin.generateCheckinSummary();
      router.replace({
        pathname: '/checkin/summary',
        params: { sessionId: checkin.sessionId ?? '' },
      });
    } catch {
      setGeneratingSummary(false);
    }
  }

  const childName = child?.name ?? 'Child';
  const showInput = !checkin.aiReady && !generatingSummary;

  return (
    <View style={styles.root}>
      <CheckinHeader onBack={() => router.back()} backDisabled={generatingSummary} showStatusDot />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + CHECKIN_HEADER_HEIGHT,
              paddingBottom: showInput ? 100 + insets.bottom : 20 + insets.bottom,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces
          alwaysBounceVertical
          overScrollMode="always"
          scrollEventThrottle={16}
          removeClippedSubviews={Platform.OS === 'android'}
        >
          <Text style={[typography.caption, styles.sessionLabel]}>Health check-in for {childName}</Text>

          {checkin.messages.map((msg, index) => {
            const isLastAi = msg.role === 'ai' && index === checkin.messages.length - 1;
            return msg.role === 'ai' ? (
              <AiMessage
                key={msg.id}
                text={msg.content}
                quickOptions={isLastAi && !checkin.loading && !checkin.aiReady ? msg.quickOptions : undefined}
                onOptionTap={sendReply}
              />
            ) : (
              <UserMessage key={msg.id} text={msg.content} />
            );
          })}

          {checkin.loading && <TypingIndicator />}

          {checkin.error && <Text style={[typography.bodySM, styles.errorText]}>{checkin.error}</Text>}

          {checkin.aiReady && !generatingSummary && (
            <View style={styles.summarySection}>
              <Text style={[typography.bodySM, styles.centerText]}>
                Ready to make {childName}&apos;s pre-visit summary.
              </Text>
              <GradientButton label="Generate summary" onPress={handleGenerateSummary} />
            </View>
          )}

          {generatingSummary && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={AppColors.primary} />
              <Text style={typography.meta}>Generating summary…</Text>
            </View>
          )}
        </ScrollView>

        {showInput && (
          <View style={styles.inputWrapper} pointerEvents="box-none">
            <LinearGradient
              colors={[
                CanvasFade.a0,
                CanvasFade.a25,
                CanvasFade.a69,
                AppColors.surface,
              ]}
              locations={[0, 0.25, 0.5, 0.7]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              pointerEvents="none"
            />
            <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <ChatComposer
                inputRef={inputRef}
                value={inputText}
                onChangeText={setInputText}
                onSend={() => sendReply()}
                sendDisabled={!inputText.trim() || checkin.loading}
                editable={!checkin.loading}
                submitOnEnter
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.surface },
  keyboardView: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  sessionLabel: { textAlign: 'center', paddingVertical: 12, marginBottom: 8 },

  errorText: { color: AppColors.danger, paddingVertical: 8, paddingLeft: 44 },

  summarySection: { marginTop: 8, gap: 12 },
  centerText: { textAlign: 'center' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },

  inputWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  inputBar: { paddingHorizontal: 16, paddingTop: 12 },
});
