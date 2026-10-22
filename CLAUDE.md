# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LilSteps is a React Native mobile application built with Expo (SDK 57) and TypeScript. It targets iOS, Android, and Web platforms from a shared codebase.

## Development Commands

```bash
# Start development server
npm start              # or: npx expo start

# Run on specific platform
npm run ios            # iOS simulator
npm run android        # Android emulator
npm run web            # Web browser

# Linting
npm run lint           # ESLint with Expo config

# Reset to blank project
npm run reset-project  # Moves app/ to app-example/
```

## Architecture

**Routing**: Expo Router with file-based routing in `app/` directory. Routes are defined by file structure:
- `app/index.tsx` - Splash screen (entry point)
- `app/(auth)/` - Auth flow group (login, signup)
- `app/(tabs)/` - Tab navigator group (future main app)
- `app/_layout.tsx` - Root layout wrapper (font loading, navigation stack)

**Theming**: LilSteps purple palette (since 22 Oct 2026): #49378f primary, #6052bc accent, #ebe9ff lavender surface, #0b1632 ink, #fdfeff background. Token names (`forest`, `mint`, `ForestRamp`…) are kept from the old forest-green theme but now hold purple values. Tokens in `constants/theme.ts`, rules in `DESIGN.md` (its colour tables still describe the old greens):
- `AppColors` — colour tokens (Material-style names; purple/lavender values under the old names). Also `Radius`, `Spacing`, `Shadow`, `Motion`, `CanvasFade`, `ChildColors`, `ForestRamp`, `softSurface()`
- `global.css` — HeroUI / uniwind variables, mirrored 1:1 from `AppColors`
- `styles/global.ts` — shared typography (Inter only, 7-size scale: 32/22/17/15/13/12 + 22 numbers) and layout presets
- The app is light-only (`app.json` + `Uniwind.setTheme('light')`). Green only for success/status meaning; no `${AppColors.x}NN` alpha tints

**Platform-specific code**: Uses file extensions for platform variants:
- `.ios.tsx` - iOS-specific implementation
- `.web.ts` - Web-specific implementation

## Key Configuration

- **TypeScript**: Strict mode enabled, path alias `@/*` maps to project root
- **New Architecture**: Always on (SDK 55+; no app.json flag)
- **React Compiler**: Experimental React compiler enabled
- **Typed Routes**: Expo Router typed routes enabled

## Screen Development Ruleset

When building any new screen, reference assets are stored in the `screens/` directory at the project root. Each screen has its own subfolder:

```
screens/
  <ScreenName>/
    reference.html    # HTML mockup of the screen layout and design
    reference.png     # Reference image/screenshot of the intended design
```

**Rules for implementing screens:**

1. **Always check `screens/<ScreenName>/`** before implementing a screen — both the HTML file and the image must be used as the source of truth for layout, spacing, colors, and component structure.
2. **The reference image** defines the visual target. Match it as closely as possible in the React Native implementation.
3. **The HTML file** provides structural and styling details (colors, fonts, spacing, hierarchy) that may not be fully visible in the image. Use it to extract exact values.
4. **Do not deviate** from the reference design without explicit instruction from the user.
5. **Folder naming** must match the screen name exactly (e.g., `screens/HomeScreen/`, `screens/OnboardingScreen/`).
6. **Always reference `DESIGN.md`** at the project root before building any screen. This file defines the app's design system — color palette, typography, spacing, and component styles. All screens must follow the design tokens and theme defined there to ensure visual consistency across the app.

## Component & Style Rules

**No repetitive code — extract reusable components:**

1. **All reusable components live in `components/`**. Before writing any UI element inline in a screen, check if a matching component already exists. If a piece of UI is used (or could be used) on more than one screen, it **must** be a component.
2. **Screen files (`app/`) should be thin** — they compose components and contain only screen-specific layout/logic. Screens should NOT define reusable UI inline.
3. **Existing reusable components** (add to this list as the app grows):
   - `AppLogo` — brand logo icon + name
   - `GradientBackground` — flat sage canvas; `variant="welcome"` adds two soft static blobs
   - `GlassCard` — white bordered card with tones (`mint`, `sunshine`, `info`, `forest` = light-green glass hero) and `elevated`
   - `ui/HeroCard` — light-green glass hero card (`HeroCard`, `HeroBackdrop` + `heroCardStyle`, `HeroBadge`); big cards are light green, deep green is for actions
   - `AvatarStack` — overlapping avatar circles with count badge
   - `GradientButton` — forest / white pill with arrow circle; `outline` / `ghost` / `danger` variants, `size` (`md` 48 default, `lg` 56 splash only, `sm` 32), `loading`, real disabled state; also exports `TextButton`
   - `ScreenHeader` (+ `HeaderIconButton`) — the one stack-screen header: plain back icon, 17 SemiBold title, right slot, height 52
   - `TextInputField` — input with `fieldBorder`, focus ring, `error` and `leading` per DESIGN.md
   - `ChipGroup` — single/multi-select chips (mint selected state with check)
   - `OnboardingShell` — onboarding frame: back button, animated progress, optional `sprout` mood
   - `EmptyState` — Sprout + prop scene, title, body, optional action; `compact` one-liner (no Sprout) for empty sections
   - `ChildAvatar` (+ `childColorIndex`) — child initial/photo with a per-child colour ring, optional static progress arc
   - `mascot/Sprout` (+ `SproutArt`) — seedling mascot, moods happy/cheer/think/sleepy/care/wave
   - `celebrate/Celebrate` — confetti burst + celebration card via `ref.fire({...})`
   - `ui/PressableScale` — the press primitive (UI-thread scale + colour)
   - `ui/AnimatedProgress` — transform-only progress bar with optional sunshine thumb
   - `ui/StatusPill` — semantic status pill (colour + icon + label)
   - `ui/Sticker` — clay reward sticker (rewards logging only)
   - `ui/useMotion` / `haptic` — reduced-motion flag and safe haptics

**Style separation — global vs screen-specific:**

4. **Global/shared styles live in `styles/global.ts`**. This includes typography presets (`typography.*`), common layout patterns (`layout.*`), and any style that is used across multiple screens. Always import from here instead of re-declaring font families, font sizes, or common layouts.
5. **Screen-specific styles stay co-located** with their screen file in a `StyleSheet.create()` block at the bottom. These should only contain layout overrides and positioning unique to that screen (e.g., margins, absolute positioning, alignment tweaks).
6. **Tab screens** (`app/(tabs)/*.tsx`) follow the same rule — each tab screen has its own co-located `StyleSheet` for screen-specific styles, and imports shared styles from `styles/global.ts`.
7. **Never duplicate style values**. If you find yourself writing the same `fontFamily`, `fontSize`, `color`, or layout pattern in more than one file, move it to `styles/global.ts` or `constants/theme.ts`.
