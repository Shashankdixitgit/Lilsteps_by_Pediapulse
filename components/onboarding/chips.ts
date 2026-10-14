/**
 * Single-select chip answers are stored in the onboarding context as a string
 * ('' = not answered) but ChipGroup works with string[]. These convert.
 */
export const toChips = (value: string): string[] => (value ? [value] : []);

export const fromChips = (values: string[]): string => values[0] ?? '';

/** "Your relationship to the child" (parents.relationship). */
export const RELATIONSHIP_OPTIONS = ['Mother', 'Father', 'Grandparent', 'Guardian'];

/** Preferred language (parents.preferred_language). The app UI is English only for now. */
export const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu'];
