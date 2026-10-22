import { Platform } from 'react-native';

/**
 * LilSteps colour tokens: the LilSteps purple palette (see DESIGN.md).
 *
 * Base: five brand colours. Deep purple #49378f is the primary (actions),
 * purple #6052bc the accent, lavender #ebe9ff the light tint, midnight navy
 * #0b1632 the ink and #fdfeff the canvas. Neutrals are COOL / LAVENDER-TINTED
 * so greys sit with the purples instead of reading as a different family.
 * Token names still say forest / mint / green for history; the VALUES are
 * purple. Map by role: forest = primary, mint = accent, *Wash/*Surface = lavender.
 *
 * Rules:
 * - Every colour token is a 6-digit `#rrggbb` string, EXCEPT the rgba ones
 *   (`overlay`, `onDark*`, `glass*`, `heroSheen*`, `heroBorder`, `heroPill`,
 *   `heroTrack`), which must never be concatenated.
 * - Big feature cards (heroes) are lavender glass (`components/ui/HeroCard`).
 *   Deep purple `primary` is for actions: buttons, selected chips, bubbles.
 *   On a hero: titles forestDeep (navy), body onSurfaceVariant, small
 *   highlights secondary (accent purple), display highlights may use mint.
 * - Never build tints with `${AppColors.x}NN`. Use the solid ramp tokens
 *   (greenWash, mintSurface, mintBorder, *Surface, *Border) or CanvasFade.
 * - `mint` (accent #6052bc) is fine as text/icons on white, canvas and
 *   lavender (>= 5:1) but NEVER on `primary` (1.5:1). On primary use
 *   `onPrimary` or `lavender` for highlights.
 * - `outline` is for icons; as text only on pure white. Text uses `muted`+.
 * - Body text ratios (WCAG 2.x): onSurface 17.9, onSurfaceVariant 8.3,
 *   muted >= 4.6 on every light surface (incl. lavender heroes).
 */
export const AppColors = {
  // Brand purples (legacy forest/mint/green names kept so call sites keep working)
  primary: '#49378f', // deep purple: buttons, active states, selected chips, small fills (white 9.4:1)
  primaryDim: '#3b2c78', // pressed primary
  forestDeep: '#0b1632', // midnight navy: heading text (max contrast)
  primaryContainer: '#6052bc', // accent purple (= mint)
  secondary: '#6052bc', // accent text / links / focus / progress fill on light (6.1:1 on white)
  secondaryContainer: '#ebe9ff', // = mintSurface (lavender)
  onPrimary: '#ffffff',
  onPrimaryContainer: '#ffffff', // white on accent purple (6.1:1)
  forest: '#49378f',
  forestSecondary: '#6052bc',
  mint: '#6052bc', // accent: highlights, accent words, decorative shapes; never on primary
  lavender: '#ebe9ff', // light tint; also the highlight colour ON primary (7.9:1)
  mintBorder: '#d9d4ff', // lavender hairline
  mintSurface: '#ebe9ff', // lavender
  greenWash: '#f5f4ff', // palest lavender wash

  // Attention / alert
  tertiary: '#B42318',
  tertiaryContainer: '#FDECEA',

  // Cool lavender-tinted neutrals
  background: '#fdfeff',
  surface: '#fdfeff', // canvas
  surfaceContainerLowest: '#FFFFFF', // cards, inputs, tab bar
  card: '#FFFFFF',
  surfaceContainerLow: '#f8f8fd',
  surfaceContainer: '#f1f0f9',
  surfaceContainerHigh: '#e8e7f3',
  surfaceContainerHighest: '#dddbeb',
  surfaceDim: '#dddbeb',
  border: '#e5e4f0', // decorative hairlines
  borderStrong: '#cfcde0', // outline buttons, unearned sticker slots
  fieldBorder: '#7c8098', // TextInput + unselected checkbox edge (>= 3:1 on white)
  onSurface: '#0b1632', // primary text (midnight navy ink)
  onBackground: '#0b1632',
  onSurfaceVariant: '#474d66', // secondary text
  muted: '#5a6079', // captions, meta, placeholder, disabled labels
  placeholder: '#5a6079',
  outline: '#686e86', // icons only (text only on #FFFFFF)
  outlineVariant: '#aaaec2', // decorative / disabled icons only
  ink: '#0b1632', // navy circle in the white pill CTA
  overlay: 'rgba(11, 22, 50, 0.45)', // navy modal scrim, never concatenate
  onDarkMuted: 'rgba(255, 255, 255, 0.78)', // body text on primary / navy
  onDarkSubtle: 'rgba(255, 255, 255, 0.10)', // glassy pill fill on primary (subtle glass)
  onDarkBorder: 'rgba(255, 255, 255, 0.22)', // glassy pill border on primary
  onDarkHairline: 'rgba(255, 255, 255, 0.12)', // 1px top-light hairline on dark heroes
  // Subtle glass on light surfaces (tab bar, floating CTAs): translucent white + purple hairline.
  glassLight: 'rgba(255, 255, 255, 0.80)',
  glassBorder: 'rgba(73, 55, 143, 0.14)',
  onDarkTrack: 'rgba(255, 255, 255, 0.14)', // progress track on primary
  // Lavender glass heroes (big feature cards). Deep purple is for actions only.
  // Fill is a 2-stop LinearGradient heroFill -> heroFillEnd (top-left to bottom-right).
  heroFill: '#ebe9ff', // lavender, top-left stop (also the solid fallback)
  heroFillEnd: '#f5f4ff', // paler lavender, bottom-right stop
  heroSheen: 'rgba(255, 255, 255, 0.50)', // white top highlight, fades to heroSheenEnd over the top 45%
  heroSheenEnd: 'rgba(255, 255, 255, 0)',
  heroBorder: 'rgba(255, 255, 255, 0.85)', // 1px glass edge on light heroes
  heroPill: 'rgba(255, 255, 255, 0.70)', // badge / pill / stat-tile fill on light heroes (+ mintBorder hairline)
  heroTrack: 'rgba(255, 255, 255, 0.70)', // progress track on light heroes (fill = primary)
  // Legacy gradient end: equals primary so legacy gradients render solid purple.
  gradientEnd: '#49378f',

  // Semantic (always paired with an icon + label). Success stays green: it means "done / fine".
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

  // Friendly accents (<= 10% of a screen; text on fills is always primary or ink)
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
  healthGreen: '#6052bc', // brand accent (was green)
  healthGreenSurface: '#f3f1ff',
  healthGreenOnSurface: '#0b1632',
  healthGreenText: '#6052bc',
  successGreen: '#1E7A4C', // semantic success (typical range, normal temperature)
  successGreenDark: '#145C39',
  successGreenSurface: '#E3F3E7',
  successGreenBright: '#71c286', // semantic: "mild" step of the severity scale
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
 * old `${color}18` alpha concatenation. Falls back to greenWash (palest lavender).
 */
const SOFT_SURFACES: Record<string, string> = {
  [AppColors.primary]: AppColors.greenWash,
  [AppColors.forestDeep]: AppColors.greenWash,
  [AppColors.secondary]: AppColors.mintSurface, // = mint (same accent purple)
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

/** Canvas fade stops (#fdfeff at alpha). The only alpha tints allowed. */
export const CanvasFade = {
  a0: 'rgba(253, 254, 255, 0)',
  a13: 'rgba(253, 254, 255, 0.13)',
  a25: 'rgba(253, 254, 255, 0.25)',
  a38: 'rgba(253, 254, 255, 0.38)',
  a69: 'rgba(253, 254, 255, 0.69)',
  a91: 'rgba(253, 254, 255, 0.91)',
  solid: '#fdfeff',
} as const;

/** Solid deep purple -> soft purple ramp (splash stepping stones, decorative steps). Name kept for call sites. */
export const ForestRamp = ['#49378f', '#54439f', '#6052bc', '#7e72cf', '#a299e2'] as const;

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

/** Navy-tinted CSS box shadows (New Architecture). Never pair with overflow:'hidden'. */
export const Shadow = {
  card: '0px 1px 2px rgba(11, 22, 50, 0.04), 0px 6px 16px rgba(11, 22, 50, 0.06)',
  raised: '0px 2px 4px rgba(11, 22, 50, 0.06), 0px 12px 28px rgba(11, 22, 50, 0.10)',
  clay: '0px 6px 14px rgba(11, 22, 50, 0.10), inset 0px -3px 0px rgba(11, 22, 50, 0.06)',
  focusRing: '0px 0px 0px 3px #ebe9ff',
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
