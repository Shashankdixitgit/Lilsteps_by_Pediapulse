import { StyleSheet, TextStyle } from 'react-native';

import { AppColors, FontFamily } from '@/constants/theme';

/**
 * Shared typography: Inter only (per DESIGN.md). Seven sizes only:
 * 32 display, 22 h1, 17 h2, 15 body/title, 13 meta, 12 caption, 22 number.
 * Vary weight and colour rather than adding sizes. Always fontFamily names,
 * never fontWeight (Android ignores weight on custom families). Nothing below 12.
 *
 * "Accent" is a colour modifier, not a preset: lavender on primary, secondary
 * (accent purple) on light (see `accent` / `accentOnDark`).
 */
/** Splash and onboarding-complete only. */
const display: TextStyle = {
  fontFamily: FontFamily.bold,
  fontSize: 32,
  lineHeight: 38,
  letterSpacing: -0.8,
  color: AppColors.forestDeep,
};
/** h1: screen / tab title, onboarding step title, hero title. */
const heading: TextStyle = {
  fontFamily: FontFamily.bold,
  fontSize: 22,
  lineHeight: 28,
  letterSpacing: -0.4,
  color: AppColors.forestDeep,
};
/** h2: section title, card title, stack header title. */
const headingSM: TextStyle = {
  fontFamily: FontFamily.semibold,
  fontSize: 17,
  lineHeight: 24,
  letterSpacing: -0.2,
  color: AppColors.onSurface,
};
/** Row / item title (15 SemiBold). */
const title: TextStyle = {
  fontFamily: FontFamily.semibold,
  fontSize: 15,
  lineHeight: 22,
  letterSpacing: -0.1,
  color: AppColors.onSurface,
};
const body: TextStyle = {
  fontFamily: FontFamily.regular,
  fontSize: 15,
  lineHeight: 22,
  color: AppColors.onSurfaceVariant,
};
/** Meta line (13). Use `muted` colour for secondary meta. */
const bodySM: TextStyle = {
  fontFamily: FontFamily.regular,
  fontSize: 13,
  lineHeight: 18,
  color: AppColors.onSurfaceVariant,
};
/** Caption / field label / chip (12 Medium, sentence case). */
const label: TextStyle = {
  fontFamily: FontFamily.medium,
  fontSize: 12,
  lineHeight: 16,
  color: AppColors.onSurface,
};
/** Uppercase eyebrow: heroes only, at most one per screen. */
const eyebrow: TextStyle = {
  fontFamily: FontFamily.semibold,
  fontSize: 12,
  lineHeight: 16,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: AppColors.secondary,
};
/** Every metric number (22 Bold, tabular). Pair with `unit`. */
const metric: TextStyle = {
  fontFamily: FontFamily.bold,
  fontSize: 22,
  lineHeight: 26,
  letterSpacing: -0.4,
  fontVariant: ['tabular-nums'],
  color: AppColors.forestDeep,
};
/** Unit next to a metric ("kg", "of 38"). */
const unit: TextStyle = {
  fontFamily: FontFamily.medium,
  fontSize: 13,
  lineHeight: 18,
  color: AppColors.muted,
};

export const typography = StyleSheet.create({
  display,
  heading,
  headingSM,
  title,
  body,
  bodySM,
  label,
  eyebrow,
  metric,
  number: metric,
  unit,
  /** 13 meta in muted (dates, "Dr X", counts). */
  meta: { ...bodySM, color: AppColors.muted },
  /** 12 caption in muted (helpers, disclaimers, version lines). */
  caption: { ...label, fontFamily: FontFamily.regular, color: AppColors.muted },
  /** Section label inside forms ("Category", "Note"): 13 SemiBold. */
  sectionLabel: { ...bodySM, fontFamily: FontFamily.semibold, color: AppColors.onSurface },
  /** Colour modifiers. */
  accent: { color: AppColors.secondary },
  accentOnDark: { color: AppColors.lavender },

  // Legacy names, mapped onto the presets (kept for call sites).
  displayXL: display,
  displayLG: display,
  displayItalic: { ...display, color: AppColors.secondary },
  headingXL: heading,
  headingLG: heading,
  headingMD: headingSM,
  bodyLG: body,
  bodyMD: body,
  labelLG: { ...bodySM, fontFamily: FontFamily.semibold, color: AppColors.onSurface },
  labelSM: label,
  labelXS: label,
});

/**
 * Common layout patterns reused across screens.
 */
export const layout = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: AppColors.surface,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  /** Vertical rhythm between sections of a screen. */
  sectionGap: {
    gap: 24,
  },
  /** Section title to its content. */
  section: {
    gap: 8,
  },
  /** Screen gutter. */
  gutter: {
    paddingHorizontal: 20,
  },
});
