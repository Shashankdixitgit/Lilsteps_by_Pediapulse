/**
 * Single-select chip answers are stored in the onboarding context as a string
 * ('' = not answered) but ChipGroup works with string[]. These convert.
 */
export const toChips = (value: string): string[] => (value ? [value] : []);

export const fromChips = (values: string[]): string => values[0] ?? '';
