import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatComposer } from '@/components/chat/ChatComposer';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors } from '@/constants/theme';
import { layout, typography } from '@/styles/global';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { useMessages } from '@/hooks/useMessages';

interface ConversationInfo {
  id: string;
  doctor_name: string;
  doctor_specialisation: string;
  child_name: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { messages, loading, send, markRead } = useMessages(id ?? null);
  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<(typeof messages)[number]>>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from('conversations')
        .select('id, doctors(name, specialisation), children(name)')
        .eq('id', id)
        .single<{
          id: string;
          doctors: { name: string; specialisation: string } | null;
          children: { name: string } | null;
        }>();

      if (data) {
        setInfo({
          id: data.id,
          doctor_name: data.doctors?.name ?? 'Doctor',
          doctor_specialisation: data.doctors?.specialisation ?? '',
          child_name: data.children?.name ?? '',
        });
      }
    })();
  }, [id]);

  // Mark unread doctor messages as read when they appear.
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const toMark = messages
      .filter((m) => m.sender === 'doctor' && !m.read_at)
      .map((m) => m.id);
    if (toMark.length > 0) markRead(toMark);
  }, [messages, user, markRead]);

  // Scroll to bottom on new messages.
  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  const headerSubtitle = useMemo(() => {
    if (!info) return '';
    if (info.child_name) return `${info.doctor_specialisation} · for ${info.child_name}`;
    return info.doctor_specialisation;
  }, [info]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await send(text);
    } catch (e) {
      setDraft(text);
      console.warn('send failed', e);
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[layout.screenContainer, { paddingTop: insets.top }]}>
      <ScreenHeader title={info?.doctor_name ?? 'Chat'} subtitle={headerSubtitle || undefined} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={AppColors.primary} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[typography.body, styles.emptyText]}>No messages yet. Say hello.</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: false })
            }
            renderItem={({ item }) => (
              <MessageBubble
                sender={item.sender}
                content={item.content}
                timestamp={formatTime(item.created_at)}
              />
            )}
          />
        )}

        <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
          <ChatComposer
            value={draft}
            onChangeText={setDraft}
            onSend={handleSend}
            sendDisabled={sending || draft.trim().length === 0}
            placeholder="Type a message…"
            maxLength={4000}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyText: { color: AppColors.muted, textAlign: 'center' },

  composer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: AppColors.surface,
  },
});
