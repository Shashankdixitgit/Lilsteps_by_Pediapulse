import { Platform } from 'react-native';

/**
 * LilSteps colour tokens: "Nivaran Soft Clay" (see DESIGN.md).
 *
 * Base: the flat healthnivaran.in look (forest green, mint highlight on forest,
 * white cards). Neutrals are SAGE-TINTED (hue ~100) so they sit with the
 * blue-greens instead of fighting them like the old cold shadcn greys did.
 *
 * Rules:
 * - Every colour token is a 6-digit `#rrggbb` string, EXCEPT the rgba ones
 *   (`overlay`, `onDark*`, `glass*`, `heroSheen*`, `heroBorder`, `heroPill`,
 *   `heroTrack`), which must never be concatenated.
 * - Big feature cards (heroes) are light-green glass (`components/ui/HeroCard`).
 *   Deep green `primary` is for actions: buttons, selected chips, bubbles.
 *   On a hero: titles forestDeep, body onSurfaceVariant, small highlights
 *   secondary, display-size highlights (>= 24px bold) may use success.
 * - Never build tints with `${AppColors.x}NN`. Use the solid ramp tokens
 *   (greenWash, mintSurface, mintBorder, *Surface, *Border) or CanvasFade.
 * - `mint` / `primaryContainer` is never text or a progress fill on light
 *   surfaces (incl. light heroes: 1.8:1). Decorative dots/shapes only.
 * - `outline` is for icons; as text only on pure white. Text uses `muted`+.
 * - Body text ratios (WCAG 2.x): onSurface 15.6, onSurfaceVariant 7.0,
 *   muted >= 4.6 on every light surface.
 */
export const AppColors = {
  // Brand greens
  primary: '#0E4A35', // forest: buttons, active states, small fills; NOT big cards (lighter than #042618 per user; white 10.2:1, mint 4.8:1)
  primaryDim: '#093A29', // pressed forest
  forestDeep: '#042618', // small heading text only (max contrast)
  primaryContainer: '#71c286', // mint: highlight on forest only
  secondary: '#0a4d3a', // green text / links / focus / progress fill on light
  secondaryContainer: '#E4F4E8', // = mintSurface
  onPrimary: '#ffffff',
  onPrimaryContainer: '#042618',
  forest: '#0E4A35',
  forestSecondary: '#0a4d3a',
  mint: '#71c286',
  mintBorder: '#C6E8CF',
  mintSurface: '#E4F4E8',
  greenWash: '#F0F8F2',

  // Attention / alert
  tertiary: '#B42318',
  tertiaryContainer: '#FDECEA',

  // Sage neutrals
  background: '#F6F7F2',
  surface: '#F6F7F2', // canvas
  surfaceContainerLowest: '#FFFFFF', // cards, inputs, tab bar
  card: '#FFFFFF',
  surfaceContainerLow: '#F9FAF6',
  surfaceContainer: '#EFF2EB',
  surfaceContainerHigh: '#E7EBE3',
  surfaceContainerHighest: '#DDE3D8',
  surfaceDim: '#DDE3D8',
  border: '#E2E6DD', // decorative hairlines
  borderStrong: '#CDD4C8', // outline buttons, unearned sticker slots
  fieldBorder: '#7D8A82', // TextInput + unselected checkbox edge (3.6:1 on white)
  onSurface: '#13201A', // primary text
  onBackground: '#13201A',
  onSurfaceVariant: '#4A5750', // secondary text
  muted: '#5F6B64', // captions, meta, placeholder, disabled labels
  placeholder: '#5F6B64',
  outline: '#6B7770', // icons only (text only on #FFFFFF)
  outlineVariant: '#A9B4AC', // decorative / disabled icons only
  ink: '#0a0a0a', // black circle in the white pill CTA
  overlay: 'rgba(4, 38, 24, 0.45)', // modal scrim, never concatenate
  onDarkMuted: 'rgba(255, 255, 255, 0.78)', // body text on forest
  onDarkSubtle: 'rgba(255, 255, 255, 0.10)', // glassy pill fill on forest (subtle glass)
  onDarkBorder: 'rgba(255, 255, 255, 0.22)', // glassy pill border on forest
  onDarkHairline: 'rgba(255, 255, 255, 0.12)', // 1px top-light hairline on forest heroes
  // Subtle glass on light surfaces (tab bar, floating CTAs): translucent white + green hairline.
  glassLight: 'rgba(255, 255, 255, 0.80)',
  glassBorder: 'rgba(14, 74, 53, 0.14)',
  onDarkTrack: 'rgba(255, 255, 255, 0.14)', // progress track on forest
  // Light-green glass heroes (big feature cards). Deep green is for actions only.
  // Fill is a 2-stop LinearGradient heroFill -> heroFillEnd (top-left to bottom-right).
  heroFill: '#D4EEDC', // light mint, top-left stop (also the solid fallback)
  heroFillEnd: '#E8F5EC', // paler mint, bottom-right stop
  heroSheen: 'rgba(255, 255, 255, 0.50)', // white top highlight, fades to heroSheenEnd over the top 45%
  heroSheenEnd: 'rgba(255, 255, 255, 0)',
  heroBorder: 'rgba(255, 255, 255, 0.85)', // 1px glass edge on light heroes
  heroPill: 'rgba(255, 255, 255, 0.70)', // badge / pill / stat-tile fill on light heroes (+ mintBorder hairline)
  heroTrack: 'rgba(255, 255, 255, 0.70)', // progress track on light heroes (fill = primary)
  // Legacy gradient end: equals primary so legacy gradients render solid forest.
  gradientEnd: '#0E4A35',

  // Semantic (always paired with an icon + label)
  success: '#1E7A4C',
  successSurface: '#E3F3E7',
  successBorder: '#C6E8CF',
  warning: '#9A5B00',
  warningSurface: '#FFF4DB',
  warningBorder: '#F6DFA0',
  danger: '#B42318',
  dangerSurface: '#FDECEA',
  dangerBorder: '#F5C2BC',
  info: '#1F6B93',
  infoSurface: '#E6F3FA',
  infoBorder: '#BFE0F0',

  // Friendly accents (<= 10% of a screen; text on fills is always forest)
  sunshine: '#F7C948',
  sunshineSurface: '#FFF6D6',
  sunshineText: '#8A5A00',
  peach: '#F4A38A',
  peachSurface: '#FFEDE6',
  peachText: '#B4441F',
  sky: '#8CCBEA',
  skySurface: '#E6F3FA',
  skyText: '#1F6B93',

  // Legacy names (kept so call sites keep working)
  accentBlue: '#1F6B93',
  healthGreen: '#0a4d3a',
  healthGreenSurface: '#EEF7F0',
  healthGreenOnSurface: '#042618',
  healthGreenText: '#0a4d3a',
  successGreen: '#1E7A4C',
  successGreenDark: '#145C39',
  successGreenSurface: '#E3F3E7',
  successGreenBright: '#71c286',
  errorRed: '#B42318',
  errorRedSurface: '#FDECEA',
  warningAmber: '#9A5B00',
  warningAmberSurface: '#FFF4DB',
  warningAmberBorder: '#F6DFA0',
  warningAmberText: '#7A4700',
  starGold: '#F7C948',
  orange: '#B4441F',
  orangeSurface: '#FFEDE6',
} as const;

/**
 * Soft surface for a dynamic accent colour (categories, tags). Replaces the
 * old `${color}18` alpha concatenation. Falls back to greenWash.
 */
const SOFT_SURFACES: Record<string, string> = {
  [AppColors.primary]: AppColors.greenWash,
  [AppColors.forestDeep]: AppColors.greenWash,
  [AppColors.secondary]: AppColors.mintSurface,
  [AppColors.mint]: AppColors.mintSurface,
  [AppColors.success]: AppColors.successSurface,
  [AppColors.warning]: AppColors.warningSurface,
  [AppColors.danger]: AppColors.dangerSurface,
  [AppColors.info]: AppColors.infoSurface,
  [AppColors.orange]: AppColors.peachSurface,
  [AppColors.sunshine]: AppColors.sunshineSurface,
  [AppColors.peach]: AppColors.peachSurface,
  [AppColors.sky]: AppColors.skySurface,
  [AppColors.onSurfaceVariant]: AppColors.surfaceContainer,
  [AppColors.muted]: AppColors.surfaceContainer,
};
export function softSurface(color: string): string {
  return SOFT_SURFACES[color] ?? AppColors.greenWash;
}

/** Canvas fade stops (#F6F7F2 at alpha). The only alpha tints allowed. */
export const CanvasFade = {
  a0: 'rgba(246, 247, 242, 0)',
  a13: 'rgba(246, 247, 242, 0.13)',
  a25: 'rgba(246, 247, 242, 0.25)',
  a38: 'rgba(246, 247, 242, 0.38)',
  a69: 'rgba(246, 247, 242, 0.69)',
  a91: 'rgba(246, 247, 242, 0.91)',
  solid: '#F6F7F2',
} as const;

/** Solid forest -> mint ramp (splash stepping stones, decorative steps). */
export const ForestRamp = ['#1A5A42', '#246A4C', '#2F7A55', '#4E9A62', '#71c286'] as const;

/** Per-child colour pair (fill + soft surface), by sibling order. */
export const ChildColors = [
  { ring: AppColors.mint, surface: AppColors.mintSurface },
  { ring: AppColors.sunshine, surface: AppColors.sunshineSurface },
  { ring: AppColors.peach, surface: AppColors.peachSurface },
  { ring: AppColors.sky, surface: AppColors.skySurface },
] as const;

/** Inter weights loaded in app/_layout.tsx. Use these instead of fontWeight. */
export const FontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Corner radii: controls 10, cards 16, heroes/sheets 24. */
export const Radius = {
  sm: 8,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

/** Forest-tinted CSS box shadows (New Architecture). Never pair with overflow:'hidden'. */
export const Shadow = {
  card: '0px 1px 2px rgba(4, 38, 24, 0.04), 0px 6px 16px rgba(4, 38, 24, 0.06)',
  raised: '0px 2px 4px rgba(4, 38, 24, 0.06), 0px 12px 28px rgba(4, 38, 24, 0.10)',
  clay: '0px 6px 14px rgba(4, 38, 24, 0.10), inset 0px -3px 0px rgba(4, 38, 24, 0.06)',
  focusRing: '0px 0px 0px 3px #E4F4E8',
  /** Explicitly no shadow (plain cards are border-only). */
  none: 'none',
} as const;

/**
 * Fixed control sizes (declutter pass). Primary CTA 48 (56 only on splash),
 * small inline action pills 32, icon buttons 40 (no fill/border), list-row
 * icon wells 36, stack-screen header 52.
 */
export const Size = {
  buttonPrimary: 48,
  buttonLarge: 56,
  buttonSmall: 32,
  iconBtn: 40,
  iconWell: 36,
  header: 52,
  /** Icon glyph sizes: header 22, list row 18, inline/meta 14. */
  iconHeader: 22,
  iconRow: 18,
  iconMeta: 14,
} as const;

/** Glass blur intensity for expo-blur (iOS only; Android uses the translucent fill alone). */
export const GlassBlur = 15;

/** Motion presets (reanimated). Reduced motion is handled in components/ui/useMotion. */
export const Motion = {
  pressScale: 0.97,
  pressIn: 120,
  springPress: { damping: 15, stiffness: 220 },
  springBouncy: { damping: 12, stiffness: 180, mass: 0.8 },
  enter: 280,
  exit: 180,
  stagger: 40,
  staggerCap: 6,
  celebrate: 1200,
  progress: 600,
} as const;

export const Colors = {
  light: {
    text: AppColors.onSurface,
    background: AppColors.background,
    tint: AppColors.primary,
    icon: AppColors.onSurfaceVariant,
    tabIconDefault: AppColors.muted,
    tabIconSelected: AppColors.primary,
  },
  // App is light-only (see DESIGN.md). Dark mirrors light until a real dark palette ships.
  dark: {
    text: AppColors.onSurface,
    background: AppColors.background,
    tint: AppColors.primary,
    icon: AppColors.onSurfaceVariant,
    tabIconDefault: AppColors.muted,
    tabIconSelected: AppColors.primary,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
