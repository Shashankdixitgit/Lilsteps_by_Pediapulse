import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAiConsent } from '@/components/checkin/AiConsent';
import { AiMessage } from '@/components/checkin/AiMessage';
import { CHECKIN_HEADER_HEIGHT, CheckinHeader } from '@/components/checkin/CheckinHeader';
import { MentalHealthSupport } from '@/components/checkin/MentalHealthSupport';
import { TypingIndicator } from '@/components/checkin/TypingIndicator';
import { UserMessage } from '@/components/checkin/UserMessage';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { GradientButton } from '@/components/gradient-button';
import { AppColors, CanvasFade, FontFamily, Radius } from '@/constants/theme';
import { typography } from '@/styles/global';
import { useChild } from '@/context/child';
import { useCheckin } from '@/hooks/useCheckin';
import { WEB_DEMO } from '@/lib/webDemo';

function callEmergency() {
  Linking.openURL('tel:112').catch(() => {});
}

/**
 * A red Call 112 card in the chat: the danger-sign card (C3 / R3-03) and the
 * crisis card (C2). Wording pending Dr Atish sign-off (C5).
 */
function EmergencyCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.dangerCard} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <View style={styles.dangerRow}>
        <Ionicons name="alert-circle" size={18} color={AppColors.danger} style={styles.dangerIcon} />
        <View style={styles.dangerTextWrap}>
          <Text style={styles.dangerTitle}>{title}</Text>
          <Text style={styles.dangerText}>{body}</Text>
        </View>
      </View>
      <GradientButton
        label="Call 112"
        variant="danger"
        size="sm"
        onPress={callEmergency}
        accessibilityLabel="Call 112, emergency services"
        style={styles.dangerButton}
      />
    </View>
  );
}

export default function CheckinChatScreen() {
  const insets = useSafeAreaInsets();
  // `resume`: an in_progress session id offered on the entry screen.
  const { complaint, resume } = useLocalSearchParams<{ complaint?: string; resume?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const { child, loading: childLoading, refetch: refetchChildren } = useChild();
  const checkin = useCheckin(child);
  const [inputText, setInputText] = useState(WEB_DEMO ? 'Since yesterday evening. She is drinking fluids well.' : '');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [started, setStarted] = useState(false);
  const [refetchingChild, setRefetchingChild] = useState(false);
  // R3-06: height of the pinned bar (composer / Call 112), so the list can
  // scroll its last chips and the Generate summary button clear of it.
  const [pinnedHeight, setPinnedHeight] = useState(0);
  // R2-09: nothing is sent to Gemini before the parent has agreed. A deep
  // link or reload that skips the entry screen goes back to it.
  const consent = useAiConsent();
  useEffect(() => {
    if (consent.status === 'needed') router.replace('/checkin');
  }, [consent.status]);

  // C2: a cold load (deep link, web refresh) reaches here before the child
  // has loaded. Start (or resume) only once the child is there; if loading
  // ends without one, the screen shows an error with Retry instead of a
  // blank chat.
  const childId = child?.id ?? null;
  useEffect(() => {
    if (started || !childId || consent.status !== 'given') return;
    if (resume) {
      setStarted(true);
      checkin.resumeCheckin(resume).catch(() => {});
    } else if (complaint) {
      setStarted(true);
      checkin.startCheckin(complaint).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complaint, resume, childId, started, consent.status]);

  const childMissing = !childId && !childLoading && !refetchingChild;
  const nothingToStart = !resume && !complaint;

  async function retryLoadChild() {
    setRefetchingChild(true);
    try {
      await refetchChildren();
    } finally {
      setRefetchingChild(false);
    }
  }

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

  function handleRetry() {
    if (checkin.failed?.kind === 'summary') handleGenerateSummary();
    else checkin.retryLast().catch(() => {});
  }

  const childName = child?.name ?? 'Child';
  const summaryFailed = checkin.failed?.kind === 'summary';
  // Until the first reply arrives there's nothing to answer; Retry resends it.
  const startFailed = checkin.failed?.kind === 'start';
  const showInput = !checkin.aiReady && !generatingSummary && !startFailed && checkin.messages.length > 0;
  // C3: once a danger sign is reported, the full card sits at the end of the
  // chat and a slim Call 112 bar stays pinned above the composer (R3-06: a
  // full pinned card hid the chips and Generate summary at 200% zoom).
  const showDanger = checkin.dangerSigns.length > 0;
  // R3-03 EMERGENCY-NOW (fit, blue lips or skin, can't be woken, severe
  // breathing difficulty): 112 / hospital now, not "seen today".
  // Wording pending Dr Atish sign-off (C5).
  const emergency = checkin.dangerLevel === 'emergency';
  const dangerTitle = emergency ? 'This is an emergency' : `${childName} should be seen by a doctor today`;
  const dangerBody = emergency
    ? `Call 112 now or take ${childName} to the nearest hospital now. Stay with ${childName}.`
    : `Take ${childName} to a clinic or hospital today. Call 112 if ${childName} can't breathe well, turns blue, has a fit or can't be woken.`;
  const showPinned = showInput || showDanger;
  const waitingForChild = !started && !childMissing && !nothingToStart;

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
          // Screen readers announce each new AI question as it arrives.
          accessibilityLiveRegion="polite"
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + CHECKIN_HEADER_HEIGHT,
              // Room for the pinned composer / Call 112 bar, measured (R3-06).
              paddingBottom: showPinned
                ? (pinnedHeight || (showInput ? 100 : 72) + (showDanger ? 56 : 0) + insets.bottom) + 16
                : 20 + insets.bottom,
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
          {/* C4: visible on every check-in screen. */}
          <Text style={[typography.caption, styles.disclaimer]}>
            Not a diagnosis. If you book, the doctor reads your summary. In an emergency, call 112.
          </Text>

          {waitingForChild ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={AppColors.primary} />
              <Text style={typography.meta}>Getting your check-in ready…</Text>
            </View>
          ) : null}

          {childMissing || (nothingToStart && !started) ? (
            <View style={styles.errorCard} accessibilityRole="alert">
              <Text style={[typography.bodySM, styles.errorText]}>
                {childMissing
                  ? "Couldn't load your child's profile. Check your internet and try again."
                  : 'This check-in has nothing to start from. Go back and pick what is worrying you.'}
              </Text>
              {childMissing ? (
                <GradientButton
                  label="Retry"
                  variant="outline"
                  size="sm"
                  onPress={retryLoadChild}
                  accessibilityLabel="Retry loading your child's profile"
                  style={styles.retryButton}
                />
              ) : (
                <GradientButton
                  label="Go back"
                  variant="outline"
                  size="sm"
                  onPress={() => router.replace('/checkin')}
                  style={styles.retryButton}
                />
              )}
            </View>
          ) : null}

          {checkin.messages.map((msg, index) => {
            const isLastAi = msg.role === 'ai' && index === checkin.messages.length - 1;
            return msg.role === 'ai' ? (
              <View key={msg.id}>
                <AiMessage
                  text={msg.content}
                  quickOptions={isLastAi && !checkin.loading && !checkin.aiReady ? msg.quickOptions : undefined}
                  onOptionTap={sendReply}
                />
                {/* C2: support card right after the reply that first saw the concern. */}
                {msg.support ? (
                  <View style={styles.supportCard}>
                    {/* R3-01: the person at risk may be the parent ("khud ko khatam kar loon"). */}
                    {msg.support === 'crisis' ? (
                      <EmergencyCard
                        title={`If you or ${childName} might be in danger now, call 112`}
                        body={`Call 112 straight away, and make sure someone you trust is with you and ${childName}. Keep medicines and sharp things out of reach.`}
                      />
                    ) : null}
                    <MentalHealthSupport level={msg.support} childName={childName} sex={child?.sex} hideDangerCard />
                  </View>
                ) : null}
              </View>
            ) : (
              <UserMessage key={msg.id} text={msg.content} failed={msg.failed} />
            );
          })}

          {showDanger ? (
            <View style={styles.dangerInList}>
              <EmergencyCard title={dangerTitle} body={dangerBody} />
            </View>
          ) : null}

          {checkin.loading && <TypingIndicator />}

          {checkin.error && !checkin.loading && !generatingSummary ? (
            <View style={styles.errorCard} accessibilityRole="alert">
              <Text style={[typography.bodySM, styles.errorText]}>{checkin.error}</Text>
              {checkin.failed ? (
                <GradientButton
                  label="Retry"
                  variant="outline"
                  size="sm"
                  onPress={handleRetry}
                  accessibilityLabel={
                    summaryFailed
                      ? 'Retry making the summary'
                      : checkin.failed.kind === 'resume'
                        ? 'Retry opening your check-in'
                        : 'Retry sending your answer'
                  }
                  style={styles.retryButton}
                />
              ) : null}
            </View>
          ) : null}

          {checkin.aiReady && !generatingSummary && !summaryFailed && (
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

        {showPinned ? (
          <View
            style={styles.inputWrapper}
            pointerEvents="box-none"
            onLayout={(e) => setPinnedHeight(Math.ceil(e.nativeEvent.layout.height))}
          >
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
              {showDanger ? (
                <View style={styles.dangerBar}>
                  <Ionicons name="alert-circle" size={18} color={AppColors.danger} />
                  <Text style={styles.dangerBarText}>{emergency ? 'Emergency: call 112 now' : 'Getting worse? Call 112'}</Text>
                  <GradientButton
                    label="Call 112"
                    variant="danger"
                    size="sm"
                    onPress={callEmergency}
                    accessibilityLabel="Call 112, emergency services"
                  />
                </View>
              ) : null}
              {showInput ? (
                <ChatComposer
                  inputRef={inputRef}
                  value={inputText}
                  onChangeText={setInputText}
                  onSend={() => sendReply()}
                  sendDisabled={!inputText.trim() || checkin.loading}
                  editable={!checkin.loading}
                  submitOnEnter
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.surface },
  keyboardView: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  sessionLabel: { textAlign: 'center', paddingTop: 12, paddingBottom: 4 },
  disclaimer: { textAlign: 'center', paddingHorizontal: 8, marginBottom: 16 },
  supportCard: { marginBottom: 16 },

  errorCard: {
    gap: 10,
    padding: 14,
    marginBottom: 16,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.dangerBorder,
    backgroundColor: AppColors.dangerSurface,
  },
  errorText: { color: AppColors.danger },
  retryButton: { alignSelf: 'flex-start' },

  summarySection: { marginTop: 8, gap: 12 },
  centerText: { textAlign: 'center' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },

  inputWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  inputBar: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },

  dangerInList: { marginBottom: 16 },
  dangerCard: {
    gap: 10,
    padding: 12,
    marginBottom: 12,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.dangerBorder,
    backgroundColor: AppColors.dangerSurface,
  },
  dangerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dangerIcon: { marginTop: 1 },
  // No minWidth: at 200% zoom the text wraps inside the card (R3-06).
  dangerTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  dangerTitle: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.danger },
  dangerText: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.onSurface },
  dangerButton: { alignSelf: 'flex-start', maxWidth: '100%' },
  // The slim pinned bar: one short line and the button; wraps at 200% zoom.
  dangerBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.dangerBorder,
    backgroundColor: AppColors.dangerSurface,
  },
  dangerBarText: {
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.danger,
  },
});
