import { VaccinationStep } from '@/components/onboarding/VaccinationStep';

export default function VaccinationOlderScreen() {
  return <VaccinationStep path="C" screen="c-vaccination" next="/(onboarding)/c-sleep" />;
}
