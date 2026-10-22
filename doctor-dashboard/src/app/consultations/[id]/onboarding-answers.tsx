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
  // One table, grouped by section, so the doctor can scan question → answer.
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--hairline)]">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead className="bg-[var(--paper-soft)]">
          <tr>
            <th className="w-[55%] border-b border-[var(--hairline)] px-4 py-2.5 text-[12px] font-semibold text-[var(--ink-2)]">Question</th>
            <th className="border-b border-[var(--hairline)] px-4 py-2.5 text-[12px] font-semibold text-[var(--ink-2)]">Parent&apos;s answer</th>
          </tr>
        </thead>
        {sections.map((s) => (
          <tbody key={s.title}>
            <tr className="border-t border-[var(--hairline)] first:border-t-0">
              <th colSpan={2} className="bg-[var(--paper-soft)]/60 px-4 pb-1.5 pt-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">
                {s.title}
              </th>
            </tr>
            {s.items.map((i) => (
              <tr key={i.label} className="border-t border-[var(--hairline)]">
                <td className="px-4 py-2.5 align-top leading-[1.5] text-[var(--ink-3)]">{i.label}</td>
                <td className="whitespace-pre-line break-words px-4 py-2.5 align-top leading-[1.5] text-[var(--ink)]">{i.value}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
