import { formatDateTime } from '@/lib/format';

/**
 * children.onboarding_answers (migration 0031, shape v1): the path-specific
 * answers the parent gave when adding the child (C1), already in plain
 * labels. Read through the children RLS, so only a doctor with an
 * appointment with this child gets it.
 */
type AnswerItem = { label: string; value: string };
type AnswerSection = { title: string; items: AnswerItem[] };
export type OnboardingAnswers = {
  v?: number;
  path?: string;
  saved_at?: string;
  sections?: AnswerSection[];
} | null;

/** Keep only well-formed sections: the column is written by the parent's app. */
function validSections(answers: OnboardingAnswers): AnswerSection[] {
  if (!answers || !Array.isArray(answers.sections)) return [];
  return answers.sections
    .filter((s): s is AnswerSection => !!s && typeof s.title === 'string' && Array.isArray(s.items))
    .map((s) => ({
      title: s.title,
      items: s.items.filter(
        (i): i is AnswerItem => !!i && typeof i.label === 'string' && typeof i.value === 'string' && i.value.trim() !== '',
      ),
    }))
    .filter((s) => s.items.length > 0);
}

export function onboardingAnswersEyebrow(answers: OnboardingAnswers): string {
  return answers?.saved_at ? `From the parent · ${formatDateTime(answers.saved_at)}` : 'From the parent';
}

export function OnboardingAnswersList({
  answers,
  childFirstName,
}: {
  answers: OnboardingAnswers;
  childFirstName: string;
}) {
  const sections = validSections(answers);
  if (sections.length === 0) {
    return (
      <p className="text-[15px] text-[var(--ink-3)]">
        No onboarding answers on file for {childFirstName}. (Profiles created before this was added have none.)
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
      {sections.map((s) => (
        <div key={s.title}>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">{s.title}</div>
          <dl className="mt-2 border-t border-[var(--hairline)]">
            {s.items.map((i) => (
              <div key={i.label} className="grid grid-cols-1 gap-0.5 border-b border-[var(--hairline)] py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                <dt className="text-[13px] leading-[1.45] text-[var(--ink-3)]">{i.label}</dt>
                <dd className="whitespace-pre-line break-words text-[14px] leading-[1.45] text-[var(--ink)]">{i.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
