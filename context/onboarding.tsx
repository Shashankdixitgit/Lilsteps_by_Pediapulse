import { createContext, useContext, useState, ReactNode } from 'react';

type AgeBracket = 'A' | 'B' | 'C' | null;
type ChildSex = 'male' | 'female' | null;

interface OnboardingState {
  childName: string;
  bracket: AgeBracket;
  childSex: ChildSex;
  dob: Date | null;
  weight: string;
  height: string;
  bloodGroup: string;
  allergies: string[];
  conditions: string[];
  /** Canonical IAP vaccine names the parent marked as "Given" in onboarding.
   *  Used by confirm.tsx to mark the trigger-generated vaccination rows as
   *  status='done' (only the doses whose scheduled_date is on/before today). */
  vaccinationsGiven: string[];
  setChildName: (name: string) => void;
  setBracket: (bracket: AgeBracket) => void;
  setChildSex: (sex: ChildSex) => void;
  setDob: (dob: Date) => void;
  setWeight: (weight: string) => void;
  setHeight: (height: string) => void;
  setBloodGroup: (bg: string) => void;
  setAllergies: (allergies: string[]) => void;
  setConditions: (conditions: string[]) => void;
  setVaccinationsGiven: (names: string[]) => void;
}

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [childName, setChildName] = useState('');
  const [bracket, setBracket] = useState<AgeBracket>(null);
  const [childSex, setChildSex] = useState<ChildSex>(null);
  const [dob, setDob] = useState<Date | null>(null);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [vaccinationsGiven, setVaccinationsGiven] = useState<string[]>([]);

  return (
    <OnboardingContext.Provider
      value={{
        childName, bracket, childSex, dob, weight, height, bloodGroup, allergies, conditions,
        vaccinationsGiven,
        setChildName, setBracket, setChildSex, setDob, setWeight, setHeight, setBloodGroup,
        setAllergies, setConditions, setVaccinationsGiven,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
