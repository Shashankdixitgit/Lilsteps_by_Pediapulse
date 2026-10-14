import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GradientButton, TextButton } from '@/components/gradient-button';
import { TextInputField } from '@/components/text-input-field';
import {
  isFreeTextAnswer,
  SENSITIVE_SECTIONS,
  useOnboardingAnswers,
} from '@/components/home/useOnboardingAnswers';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { confirmAsync } from '@/lib/confirm';
import { typography } from '@/styles/global';

interface SetupAnswersCardProps {
  childId: string;
  childName: string;
}

/**
 * "What you told us at set-up" (R2-16): the onboarding answers the child's
 * doctor sees (children.onboarding_answers, C1), read-only, so the Privacy
 * promise "see and correct your details in Profile" holds. Sensitive answers
 * (mood, puberty, body image) can be removed, and typed descriptions edited.
 * Changes save straight away, apart from the form's "Save changes".
 */
export function SetupAnswersCard({ childId, childName }: SetupAnswersCardProps) {
  const { record, loading, error: loadError, saveAnswer } = useOnboardingAnswers(childId);
  // The answer being edited: section title + label.
  const [editing, setEditing] = useState<{ section: string; label: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (loading) return null;
  const sections = record?.sections ?? [];

  async function run(action: () => Promise<void>, doneText: string) {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await action();
      setEditing(null);
      setSaved(doneText);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(section: string, label: string) {
    const ok = await confirmAsync(
      'Remove this answer?',
      `It will be deleted from ${childName}'s profile and doctors will no longer see it.`,
      { confirmLabel: 'Remove', destructive: true },
    );
    if (ok) await run(() => saveAnswer(section, label, null), 'Answer removed.');
  }

  return (
    <View style={styles.card}>
      <Text style={typography.title} accessibilityRole="header">
        What you told us at set-up
      </Text>
      <Text style={typography.meta}>
        Doctors you book a visit with can see these answers. You can remove sensitive answers, or correct what you
        typed.
      </Text>

      {loadError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {loadError}
        </Text>
      ) : sections.length === 0 ? (
        <Text style={typography.bodySM}>No set-up answers saved for {childName}.</Text>
      ) : (
        sections.map((s) => {
          const sensitive = SENSITIVE_SECTIONS.has(s.title);
          return (
            <View key={s.title} style={styles.section}>
              <Text style={typography.sectionLabel}>{s.title}</Text>
              {s.items.map((item) => {
                const isEditing = editing?.section === s.title && editing.label === item.label;
                const canEdit = sensitive && isFreeTextAnswer(item);
                return (
                  <View key={item.label} style={styles.item}>
                    <Text style={typography.caption}>{item.label}</Text>
                    {isEditing ? (
                      <View style={styles.editBlock}>
                        <TextInputField
                          accessibilityLabel={item.label}
                          value={draft}
                          onChangeText={setDraft}
                          multiline
                          style={styles.editInput}
                        />
                        <View style={styles.actions}>
                          <GradientButton
                            label="Save"
                            size="sm"
                            showArrow={false}
                            loading={busy}
                            disabled={busy || !draft.trim()}
                            onPress={() => {
                              void run(() => saveAnswer(s.title, item.label, draft.trim()), 'Answer updated.');
                            }}
                          />
                          <TextButton label="Cancel" onPress={() => setEditing(null)} disabled={busy} />
                        </View>
                      </View>
                    ) : (
                      <Text style={typography.body}>{item.value}</Text>
                    )}
                    {sensitive && !isEditing ? (
                      <View style={styles.actions}>
                        {canEdit ? (
                          <TextButton
                            label="Edit"
                            disabled={busy}
                            onPress={() => {
                              setDraft(item.value);
                              setEditing({ section: s.title, label: item.label });
                              setError(null);
                              setSaved(null);
                            }}
                            accessibilityLabel={`Edit: ${item.label}`}
                          />
                        ) : null}
                        <TextButton
                          label="Remove"
                          tone="danger"
                          disabled={busy}
                          onPress={() => {
                            void remove(s.title, item.label);
                          }}
                          accessibilityLabel={`Remove: ${item.label}`}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        })
      )}

      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : saved ? (
        <Text style={typography.caption} accessibilityLiveRegion="polite">
          {saved}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
    gap: 12,
  },
  section: { gap: 8 },
  item: {
    gap: 2,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
    paddingTop: 8,
  },
  editBlock: { gap: 8, marginTop: 4 },
  editInput: { minHeight: 88, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  errorText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.danger,
  },
});
