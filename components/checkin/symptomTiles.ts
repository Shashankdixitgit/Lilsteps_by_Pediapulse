export interface SymptomTileData {
  key: string;
  label: string;
  sub: string;
  icon: string;
}

/** Key of the free-text tile; the entry screen shows a text box when it is on. */
export const OTHER_TILE_KEY = 'Something else';
/** Key of the mood tile; the entry screen shows the support card (C2) when it is on. */
export const MOOD_TILE_KEY = 'Mood';

export const BASE_TILES: SymptomTileData[] = [
  { key: 'Fever',     label: 'Fever',     sub: 'High temperature, chills',  icon: 'thermometer-outline' },
  { key: 'Sleep',     label: 'Sleep',     sub: 'Restless, waking up',       icon: 'moon-outline' },
  { key: 'Appetite',  label: 'Appetite',  sub: 'Low intake, refusal',       icon: 'nutrition-outline' },
  { key: 'Energy',    label: 'Energy',    sub: 'Lethargic, quiet',          icon: 'flash-outline' },
  { key: 'Cough',     label: 'Cough',     sub: 'Dry or chesty',             icon: 'medical-outline' },
  { key: 'Skin',      label: 'Skin',      sub: 'Rash, redness, spots',      icon: 'body-outline' },
  { key: 'Stomach',   label: 'Stomach',   sub: 'Pain, nausea, vomiting',    icon: 'sad-outline' },
  // Every age: breathing trouble is a danger sign at any age (asthma, wheeze).
  { key: 'Breathing', label: 'Breathing', sub: 'Fast, noisy or wheezy',     icon: 'pulse-outline' },
  // Infants (under 1 year)
  { key: 'Feeding',     label: 'Feeding',     sub: 'Breast or bottle',          icon: 'water-outline' },
  { key: 'Yellow skin', label: 'Yellow skin', sub: 'Yellow skin or eyes',         icon: 'sunny-outline' },
  { key: 'Vomiting',    label: 'Vomiting',    sub: 'Throwing up, spitting up',    icon: 'alert-circle-outline' },
  { key: 'Stools',      label: 'Stools',      sub: 'Loose, hard, colour',        icon: 'ellipse-outline' },
  { key: 'Crying',      label: 'Crying',      sub: "Won't settle, unusual cry",   icon: 'volume-high-outline' },
  // 5 years and up (Headache), 9 years and up (the rest)
  { key: 'Headache',    label: 'Headache',    sub: 'Head pain, pressure',         icon: 'cloudy-outline' },
  { key: 'Period pain', label: 'Period pain', sub: 'Cramps, heavy flow',          icon: 'flower-outline' },
  { key: 'Mood',        label: 'Mood',        sub: 'Low, anxious, irritable',     icon: 'happy-outline' },
  { key: 'Injury',      label: 'Injury',      sub: 'Fall, sprain, cut',           icon: 'bandage-outline' },
  // Always last
  { key: OTHER_TILE_KEY, label: 'Something else', sub: 'Describe it in your words', icon: 'create-outline' },
];

export const BRACKET_TILES: Record<string, string[]> = {
  NEWBORN:       ['Fever', 'Appetite', 'Breathing', 'Skin', 'Sleep', 'Energy', 'Feeding', 'Yellow skin', 'Vomiting', 'Stools', 'Crying'],
  EARLY_INFANT:  ['Fever', 'Appetite', 'Cough', 'Breathing', 'Skin', 'Sleep', 'Stomach', 'Feeding', 'Yellow skin', 'Vomiting', 'Stools', 'Crying'],
  INFANT:        ['Fever', 'Appetite', 'Cough', 'Breathing', 'Skin', 'Sleep', 'Stomach', 'Feeding', 'Yellow skin', 'Vomiting', 'Stools', 'Crying'],
  TODDLER_EARLY: ['Fever', 'Appetite', 'Cough', 'Breathing', 'Stomach', 'Sleep', 'Skin'],
  TODDLER:       ['Fever', 'Stomach', 'Cough', 'Breathing', 'Skin', 'Appetite', 'Sleep'],
  PRESCHOOL:     ['Fever', 'Stomach', 'Cough', 'Breathing', 'Sleep', 'Appetite', 'Energy'],
  SCHOOL_EARLY:  ['Fever', 'Stomach', 'Energy', 'Sleep', 'Cough', 'Breathing', 'Skin', 'Headache'],
  SCHOOL_MID:    ['Fever', 'Stomach', 'Energy', 'Sleep', 'Cough', 'Breathing', 'Skin', 'Headache', 'Period pain', 'Mood', 'Injury'],
  ADOLESCENT:    ['Energy', 'Stomach', 'Fever', 'Sleep', 'Cough', 'Breathing', 'Skin', 'Headache', 'Period pain', 'Mood', 'Injury'],
};

/**
 * Tiles for the child's age bracket, then "Something else". "Period pain"
 * shows only for girls (and children whose sex isn't recorded as male).
 */
export function getTiles(bracket: string | null, sex?: string | null): SymptomTileData[] {
  const keys = BRACKET_TILES[bracket ?? 'TODDLER'] ?? BRACKET_TILES.TODDLER;
  return [...keys, OTHER_TILE_KEY]
    .filter((k) => k !== 'Period pain' || sex === 'female')
    .map((k) => BASE_TILES.find((t) => t.key === k))
    .filter((t): t is SymptomTileData => !!t);
}
