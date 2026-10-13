import { VaccinationStep } from '@/components/onboarding/VaccinationStep';

export default function VaccinationYoungScreen() {
  return <VaccinationStep path="B" screen="b-vaccination" next="/(onboarding)/b-sleep-dental" />;
}
