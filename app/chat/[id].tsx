import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '@/components/gradient-background';
import { MessageBubble } from '@/components/chat/MessageBubble';
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
    <View style={layout.screenContainer}>
      <GradientBackground />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={AppColors.onSurface} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={typography.headingMD} numberOfLines={1}>
            {info?.doctor_name ?? 'Chat'}
          </Text>
          {!!headerSubtitle && (
            <Text style={[typography.bodySM, styles.headerSubtitle]} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          )}
        </View>
      </View>

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
            <Text style={typography.bodyMD}>No messages yet — say hello.</Text>
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
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor={AppColors.onSurfaceVariant}
            style={styles.input}
            multiline
            maxLength={4000}
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || draft.trim().length === 0}
            style={({ pressed }) => [
              styles.sendButton,
              { opacity: pressed || sending || draft.trim().length === 0 ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="send" size={18} color={AppColors.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${AppColors.surfaceContainerLowest}B3`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  headerSubtitle: { marginTop: 2, color: AppColors.onSurfaceVariant },

  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: `${AppColors.outlineVariant}40`,
    backgroundColor: AppColors.surfaceContainerLowest,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 22,
    backgroundColor: AppColors.surfaceContainer,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 16,
    color: AppColors.onSurface,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
