import { VaccinationStep } from '@/components/onboarding/VaccinationStep';

/** Path A: only vaccines with a dose already due for the child's age are asked. */
export default function VaccinationInfantScreen() {
  return <VaccinationStep path="A" screen="a-vaccination" next="/(onboarding)/a-sleep" hideNotDue />;
}
