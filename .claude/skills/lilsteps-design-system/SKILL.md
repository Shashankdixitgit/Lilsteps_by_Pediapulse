---
name: lilsteps-design-system
description: This skill should be used when building, editing, or reviewing any screen, component, or style in the LilSteps app. Applies when the user asks to implement a screen, add a component, review styling, match a reference design, or work with colors, typography, spacing, or layout in this project. Enforces DESIGN.md rules and AppColors token usage to prevent design system violations before they happen.
version: 2.0.0
---

# LilSteps Design System ("Nivaran Soft Clay")

Forest-green, flat healthnivaran.in base with a warm kid-friendly layer (Sprout mascot, celebrations, stickers, pastel accents). Always read `DESIGN.md` before implementing a screen. This is the operational checklist.

## Colour

- Use `AppColors` / `CanvasFade` / `ChildColors` / `ForestRamp` from `@/constants/theme`. Never hard-code hex in components.
- **No purple, ever.** No `${AppColors.x}NN` alpha-suffix tints: use solid ramp tokens (`greenWash`, `mintSurface`, `mintBorder`, `*Surface`, `*Border`), `softSurface(color)` for dynamic category colours, and `CanvasFade.*` for fades.
- Canvas `surface` #F6F7F2 (sage), cards `card` #FFFFFF with a `border` #E2E6DD hairline.
- Text: `onSurface` primary, `onSurfaceVariant` secondary, `muted` captions/placeholders. `outline` is for icons; `outlineVariant` is decorative only.
- **Big cards are light-green glass; deep green is for actions.** Hero/feature cards use `HeroCard` (or `HeroBackdrop` + `heroCardStyle`, or `GlassCard tone="forest"`): `heroFill` #D4EEDC → `heroFillEnd` #E8F5EC, `heroSheen` top highlight, `heroBorder` hairline. Never paint a big card `primary`.
- `primary` #0E4A35 is for buttons, selected chips, step dots, bubbles, AI tab button, logo tile, avatars. `forestDeep` #042618 for hero titles and small heading text.
- On a light hero: titles `forestDeep`, body `onSurfaceVariant`, highlights `secondary` (display-size may use `success`), pills `HeroBadge`, progress `heroTrack` + `primary` fill, CTA = default `GradientButton` (not `variant="light"`).
- Glass is subtle only: `hero*` tokens on light heroes, `glassLight` + `glassBorder` (+ iOS-only `GlassBlur` 15) on the tab bar, `onDark*` only on the rare solid-forest surface. No frosted panels.
- `mint` only on solid forest (text, highlights, progress fill). On light surfaces, including light heroes, use `secondary` / `primary`; mint is decorative there only.
- Inputs and unselected checkboxes use `fieldBorder` (3:1). Status = semantic colour + icon + label (`StatusPill`).
- Friendly accents (`sunshine`, `peach`, `sky` + `*Surface`) at most 10% of a screen; text on them is forest.

## Typography

Inter only, via `fontFamily` (`Inter_400Regular` ... `Inter_700Bold`), never `fontWeight`. Presets in `styles/global.ts`: display, heading, headingSM, title, body, bodySM, label, eyebrow, metric. Nothing under 12 px. Sentence case.

## Shape, depth, motion

- Radius: `Radius.md` 10 controls, `Radius.lg` 16 cards, `Radius.xl` 24 heroes/sheets, `full` pills. Add `borderCurve: 'continuous'`.
- Shadows: `Shadow.card` / `raised` / `clay` (`boxShadow` strings). No `shadowColor`/`elevation`; never with `overflow: 'hidden'` on the same view.
- Motion: transform + opacity only, shared values via `.get()`/`.set()`. Presses via `PressableScale`. Progress via `AnimatedProgress`. One loop per screen, paused on blur. Always honour `useMotion().reduceMotion`. Haptics via `haptic()`.

## Kid layer rules

- `Sprout` (mascot) is decorative and hidden from screen readers. Never on danger/red-flag content, prescriptions, record detail, doctor chat or video.
- `Celebrate` for real achievements only (dose recorded, all caught up, onboarding complete). Never on app open.
- `Sticker` rewards logging only, never body size or percentile.
- Use `EmptyState`, `ChildAvatar`, `GradientButton`, `GlassCard`, `HeroCard`, `TextInputField`, `ChipGroup` instead of re-styling inline.

## Checklist before marking a screen done

- [ ] Only tokens; no purple; no alpha-suffix tints
- [ ] Body text >= 4.5:1; mint never as text on light
- [ ] Inter `fontFamily` names, no `fontWeight`, nothing < 12 px
- [ ] Touch targets >= 44 pt (`hitSlop` where needed); icon-only buttons have `accessibilityLabel`
- [ ] Conditional renders use `!!x &&` or a ternary (no bare string/number `&&`)
- [ ] `boxShadow` tokens, not legacy shadows; `borderCurve: 'continuous'`
- [ ] Motion is transform/opacity only, has a reduced-motion fallback, max one loop
- [ ] Renders light even with the phone in dark mode
