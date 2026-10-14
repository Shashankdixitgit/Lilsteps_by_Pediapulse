import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LegalDocument, type LegalSection } from '@/components/legal-document';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors } from '@/constants/theme';
import { EMERGENCY_NUMBER, SUPPORT_EMAIL } from '@/lib/support';

/*
 * DRAFT FOR LAWYER REVIEW — not final legal text.
 * Written in plain English as a starting point for a pediatric teleconsult
 * app in India. Before public launch a lawyer must review it, in particular:
 *   - the legal entity that operates LilSteps (name + registered address),
 *   - fees / refunds once consultations are paid,
 *   - limitation of liability wording,
 *   - the city whose courts have jurisdiction (section "Law and disputes"),
 *   - alignment with the Telemedicine Practice Guidelines 2020, the IT Act
 *     2000 and the Digital Personal Data Protection Act 2023.
 * Keep this note in code only; parents never see the word "draft".
 */

const UPDATED = '13 October 2026';

const SECTIONS: readonly LegalSection[] = [
  {
    heading: 'About LilSteps',
    paragraphs: [
      'LilSteps helps parents in India look after the health of their children, from birth to 15 years. You can keep your child’s health details, track growth and vaccines, do an AI symptom check-in, and book an online consult with a pediatrician.',
      'By creating an account or using the app, you agree to these terms. If you do not agree, please do not use LilSteps.',
    ],
  },
  {
    heading: 'Not for emergencies',
    paragraphs: [
      `LilSteps is not an emergency service. If your child has trouble breathing, a seizure, is hard to wake, has a serious injury or you are worried their life is at risk, call ${EMERGENCY_NUMBER} or go to the nearest hospital straight away. Do not wait for an app reply or a booked consult.`,
    ],
  },
  {
    heading: 'Not a diagnosis',
    paragraphs: [
      'The AI check-in, vaccine schedule, growth charts, milestones and other information in the app are general guidance. They do not diagnose your child and are not a substitute for a doctor examining your child.',
      'The AI check-in never recommends medicines. It prepares a summary of what you told it so the doctor can get ready for your consult.',
    ],
  },
  {
    heading: 'Your child’s doctor',
    paragraphs: [
      'Consults are given by registered medical practitioners (pediatricians). The doctor, not LilSteps, is responsible for the medical advice and any prescription they give.',
      'An online consult has limits. The doctor may decide your child needs to be seen in person, may ask for tests, or may decide a prescription cannot be given online. Please follow that advice.',
      'Give the doctor complete and correct information about your child, including allergies, conditions and medicines.',
    ],
  },
  {
    heading: 'Parents and children',
    bullets: [
      'You must be 18 or older and the parent or legal guardian of each child you add.',
      'You use LilSteps on your child’s behalf and give consent for their information to be used as described in our Privacy Policy.',
      'Children should not use the app on their own. A parent or guardian should be present for every consult.',
    ],
  },
  {
    heading: 'Your account',
    bullets: [
      'You sign in with your mobile number and a one-time code. Keep your phone secure and do not share the code.',
      'Keep your details and your child’s details accurate and up to date.',
      'Tell us straight away if you think someone else has used your account.',
    ],
  },
  {
    heading: 'Your data',
    paragraphs: [
      'Your child’s health information belongs to you. We use it to run LilSteps and to let the doctor you book with care for your child. Our Privacy Policy explains what we collect, who can see it and how to delete it.',
    ],
  },
  {
    heading: 'Using LilSteps fairly',
    bullets: [
      'Do not add information about a child you are not the parent or guardian of.',
      'Do not upload anything unlawful, or anything that is not about your child’s health.',
      'Be respectful to doctors and the LilSteps team in chats and consults.',
      'Do not try to access other people’s accounts or interfere with how the app works.',
      'We may suspend or close an account that breaks these rules.',
    ],
  },
  {
    heading: 'Fees',
    paragraphs: [
      'If a consult or service has a fee, we will show you the price before you book. You will never be charged without seeing the price first.',
    ],
  },
  {
    heading: 'Ending your account',
    paragraphs: [
      'You can delete your account at any time from Profile → Privacy & security → Delete my account. This removes your account and your children’s information from LilSteps and cannot be undone.',
    ],
  },
  {
    heading: 'Our responsibility',
    paragraphs: [
      'We work hard to keep LilSteps available, accurate and secure, but we cannot promise the app will always be free of errors or interruptions.',
      'Nothing in these terms limits any right you have under Indian law, including under the Consumer Protection Act, 2019.',
    ],
  },
  {
    heading: 'Changes to these terms',
    paragraphs: [
      'We may update these terms as LilSteps grows. If a change is important, we will tell you in the app before it applies. The date at the top shows the latest version.',
    ],
  },
  {
    heading: 'Law and disputes',
    paragraphs: [
      'These terms are governed by the laws of India. Any dispute will be handled by the courts of India.',
    ],
  },
  {
    heading: 'Contact us',
    paragraphs: [`Questions about these terms? Write to ${SUPPORT_EMAIL}.`],
  },
];

export default function TermsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Terms of Service" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <LegalDocument updated={UPDATED} sections={SECTIONS} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },
});
