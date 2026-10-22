# LilSteps Design System

LilSteps helps parents look after a young child's health. The look has two layers:

1. **Base (trust):** the LilSteps purple palette (since 22 Oct 2026). Deep purple for actions, an accent purple for highlights, lavender surfaces, white cards, navy-tinted grey text, Inter, 10 px control radius, a purple pill CTA with a white arrow circle, lavender glass hero cards (deep purple is for actions).
2. **Kid layer (warmth):** a seedling mascot called Sprout, small celebrations, reward stickers, pastel accents and soft spring motion. This layer frames health information. It never replaces it. Sprout keeps its own green character colours (as on the app icon) on the purple UI.

The source of truth for every value is `constants/theme.ts` (`AppColors`, `Radius`, `Spacing`, `Shadow`, `Motion`, `CanvasFade`, `ChildColors`, `ForestRamp`). `global.css` mirrors the colours 1:1 for HeroUI / uniwind. Typography presets live in `styles/global.ts`. Token names (`forest`, `mint`, `mintSurface`, `greenWash`, `ForestRamp`, `heroFill`…) are kept from the earlier forest-green theme so call sites did not change; their values are now purple and lavender. Where this file still says forest, mint or light green below, read deep purple, accent purple and lavender.

The app is **light-only**: `app.json` sets `userInterfaceStyle: "light"`, `app/_layout.tsx` calls `Uniwind.setTheme('light')`, and the `@variant dark` block in `global.css` mirrors light.

---

## 1. Colour

### Brand palette

| Colour | Role |
|---|---|
| #49378f deep purple | Primary: actions and small solid fills |
| #6052bc purple | Accent: highlights, accent words, links, progress on light |
| #ebe9ff lavender | Light surfaces and tints |
| #0b1632 midnight navy | Ink: text, dark sections |
| #fdfeff near-white | Background |

Green is used only where it means success or status (vaccine "Given", "Normal", success banners) and for Sprout's own drawing. Proportions per screen: about 70% neutrals, 20% purples, at most 10% friendly accents.

### Purples

| Token | Hex | Use |
|---|---|---|
| `primary` / `forest` / `gradientEnd` | #49378f | Actions and small solid fills: primary buttons, selected chips, step dots, chat bubbles, active tab, AI tab button, FAB, logo tile, avatars. **Not** big cards. White on it 9.4:1 |
| `primaryDim` | #3b2c78 | Pressed primary |
| `forestDeep` | #0b1632 | Heading text (display / heading presets), where max contrast matters |
| `secondary` / `mint` / `primaryContainer` / `forestSecondary` | #6052bc | Accent text and links, focus border, chart line, progress fill on light (6.1:1 on white, 5.1:1 on lavender). **Never on primary** (1.5:1) |
| `lavender` | #ebe9ff | Highlights ON primary (7.9:1), e.g. the logo dot and AI sparkle |
| `mintBorder` | #d9d4ff | Lavender borders, selected chip outline |
| `mintSurface` / `secondaryContainer` / `heroFill` | #ebe9ff | Selected chip, icon wells, focus ring, hero fill start |
| `greenWash` / `heroFillEnd` | #f5f4ff | Faint lavender fills (upload card, notes, empty-state blob), hero fill end |

`ForestRamp` (splash steps, decorative): #49378f, #54439f, #6052bc, #7e72cf, #a299e2.

### Neutrals (tinted toward the brand hue)

| Token | Hex | Rule |
|---|---|---|
| `background`, `surface` | #fdfeff | Canvas |
| `card`, `surfaceContainerLowest` | #FFFFFF | Cards, inputs, tab bar |
| `surfaceContainerLow` | #f8f8fd | Done rows, pressed-light |
| `surfaceContainer` | #f1f0f9 | Segmented / chip tracks |
| `surfaceContainerHigh` | #e8e7f3 | Progress track, disabled button bg |
| `surfaceContainerHighest`, `surfaceDim` | #dddbeb | Strong track, dividers on canvas |
| `border` | #e5e4f0 | Decorative hairlines |
| `borderStrong` | #cfcde0 | Outline button, unearned sticker slots |
| `fieldBorder` | #7c8098 | TextInput and unselected checkbox edge (>= 3:1 on white, WCAG 1.4.11) |
| `onSurface` | #0b1632 | Primary text (17.9:1) |
| `onSurfaceVariant` | #474d66 | Secondary text |
| `muted` = `placeholder` | #5a6079 | Captions, meta, placeholders, disabled labels (>= 5.1:1 on every light surface) |
| `outline` | #686e86 | Icons only. As text only on pure white |
| `outlineVariant` | #aaaec2 | Decorative / disabled icons only |
| `ink` | #0b1632 | Navy circle in the white pill CTA |
| `overlay` | rgba(11,22,50,0.45) | Modal scrim |
| `onDarkMuted` / `onDarkSubtle` / `onDarkBorder` / `onDarkTrack` / `onDarkHairline` | white at 78% / 10% / 22% / 14% / 12% | Text, glassy pills, tracks and hero hairlines on primary |
| `glassLight` / `glassBorder` | white 80% / primary 14% | Subtle glass on light surfaces (tab bar) |
| `heroFill` → `heroFillEnd` | #ebe9ff → #f5f4ff | Lavender hero fill, 2-stop gradient top-left to bottom-right |
| `heroSheen` → `heroSheenEnd` | white 50% → 0% | White top highlight over the top 45% of a hero |
| `heroBorder` | white 85% | 1 px glass edge on light heroes |
| `heroPill` / `heroTrack` | white 70% | Badges, stat tiles and progress tracks on light heroes (pills add a `mintBorder` hairline) |

### Semantic (always colour + icon + label)

| Role | Text/icon | Surface | Border |
|---|---|---|---|
| success | #1E7A4C | #E3F3E7 | #BFE3C9 |
| warning | #9A5B00 | #FFF4DB | #F6DFA0 |
| danger | #B42318 | #FDECEA | #F5C2BC |
| info | #1F6B93 | #E6F3FA | #BFE0F0 |

### Friendly accents (<= 10% of a screen; text on them is always forest)

| Token | Fill | Soft surface | Text-safe |
|---|---|---|---|
| `sunshine` | #F7C948 | #FFF6D6 | #8A5A00 |
| `peach` | #F4A38A | #FFEDE6 | #B4441F |
| `sky` | #8CCBEA | #E6F3FA | #1F6B93 |

`ChildColors` gives each child a ring + surface by sibling order (mint, sunshine, peach, sky), using a `created_at`-sorted copy of the children list (`childColorIndex`).

### Tint rules

- **Never** build a colour with `${AppColors.x}NN`. Use the solid tokens above, `softSurface(color)` for dynamic category colours, or `CanvasFade.*` for header/tab-bar fades (the only alpha allowed).
- Every token is a 6-digit `#rrggbb` string except the rgba ones listed above.

---

### Lavender glass heroes (big cards are lavender; deep purple is for actions)

Every big feature card (splash hero, home check-in card, vaccine progress, consult AI hero, profile header, record "Next steps") is a **light lavender card with a touch of glass**, built with `components/ui/HeroCard` (`HeroCard`, or `HeroBackdrop` + `heroCardStyle` when the card itself is pressable; `GlassCard tone="forest"` renders the same thing). Recipe: `heroFill`→`heroFillEnd` gradient, `heroSheen` top highlight, 1 px `heroBorder`, `Shadow.card`, `Radius.xl`. No blur (a blur over the flat canvas adds nothing).

Content on a hero:

| Element | Token | Contrast on heroFill #D4EEDC (worst stop) |
|---|---|---|
| Title / metric | `forestDeep` | 13.2:1 |
| Title highlight phrase | `secondary` | 8.0:1 |
| Body, stats, captions | `onSurfaceVariant` | 6.2:1 |
| Small highlight, eyebrow, badge text | `secondary` | 8.0:1 (9.4:1 on `heroPill`) |
| Display-size highlight (>= 24 px bold) | `success` | 4.3:1 (large text, AA needs 3:1) |
| Badge / pill | `HeroBadge`: `heroPill` + `mintBorder`, `secondary` text | |
| Progress | `heroTrack` track, `primary` fill, sunshine thumb | |
| CTA | `GradientButton` default (`dark`): purple pill, white label 9.4:1, white circle with purple ↗ | |

Never `mint` text and never the white-pill/black-circle (`light`) CTA on a light hero.

### Subtle glass (not glassmorphism)

A faint "airy" touch on a few elevated surfaces only, never full frosted glass:

- **On light heroes:** see above (`heroPill` pills, `heroBorder` edge, `heroSheen` highlight).
- **On forest (legacy, rare):** glassy pills use `onDarkSubtle` (10% white) + `onDarkBorder` (22% white), with a 1 px `onDarkHairline` (12% white) edge.
- **On light:** the tab bar uses `glassLight` (80% white) + a 1 px `glassBorder` hairline, with `expo-blur` at `GlassBlur` (15) on **iOS only**. Android uses a 92% white fill with no blur (performance).
- No frosted blobs, no heavy blur, no gradients. If it reads as "glass UI", it is too much.

## 2. Typography: Inter only

Seven sizes only (12, 13, 15, 17, 22, 32, plus 22 for numbers). Presets live in `styles/global.ts`. Always `fontFamily` names (`Inter_400Regular`, `_500Medium`, `_600SemiBold`, `_700Bold`), never `fontWeight`. Nothing below 12 px. Sentence case.

| Preset | Role | Weight | Size / line | Default colour |
|---|---|---|---|---|
| `display` | Splash and onboarding complete only | 700 | 32 / 38, -0.8 | forestDeep |
| `heading` (h1) | Screen / tab title, onboarding step title, hero title | 700 | 22 / 28, -0.4 | forestDeep |
| `headingSM` (h2) | Section title, card title | 600 | 17 / 24, -0.2 | onSurface |
| `title` | Row / item title | 600 | 15 / 22 | onSurface |
| `body` | Body copy | 400 | 15 / 22 | onSurfaceVariant |
| `bodySM` | Meta line | 400 | 13 / 18 | onSurfaceVariant |
| `meta` | Dates, "Dr X", counts | 400 | 13 / 18 | muted |
| `sectionLabel` | Form section label ("Category", "Note") | 600 | 13 / 18 | onSurface |
| `label` | Caption, field label, chip | 500 | 12 / 16 | onSurface |
| `caption` | Helpers, disclaimers, version line | 400 | 12 / 16 | muted |
| `eyebrow` | Uppercase hero eyebrow (max one per screen, heroes only) | 600 | 12 / 16, +0.8 | secondary |
| `metric` = `number` | Every metric number | 700 | 22 / 26, tabular-nums | forestDeep |
| `unit` | Unit next to a number ("kg", "of 38") | 500 | 13 / 18 | muted |

- No 24-40 px metrics anywhere; the only display size is splash / onboarding complete.
- No uppercase eyebrows inside cards or forms: use sentence-case `label` / `sectionLabel`.
- Subtitles fit on one line (about 45 characters). Don't repeat the child's name when it is already in the title.
- `accent` / `accentOnDark` are colour modifiers (secondary on light, mint on forest). Legacy names map onto the presets: `headingXL`/`headingLG` → `heading`, `headingMD` → `headingSM`, `bodyLG`/`bodyMD` → `body`, `labelSM`/`labelXS` → `label`.

## 3. Radius, spacing, elevation, sizes

- **Radius:** `sm 8` tags, `md 10` controls and icon wells, `lg 16` cards (heroui Card via `className="rounded-2xl"`), `xl 24` light-green heroes, sheets, celebration card, tab bar; `full` CTAs, chips, avatars. Always `borderCurve: 'continuous'`.
- **Spacing:** `Spacing = {xs 4, sm 8, md 12, lg 16, xl 20, 2xl 24, 3xl 32, 4xl 40, 5xl 48}`.
  - Screen gutter 20. Header to first content 8.
  - 24 between sections (`layout.sectionGap`, `TabScreenLayout` default). Section title to its content 8 (`layout.section`).
  - 8 between stacked cards. Inside a list, prefer hairline separators in one card over one card per row.
  - Inside a card: padding 16, 12 between groups, 4 between title and meta.
- **Sizes (`Size` in theme.ts):** `buttonPrimary 48`, `buttonLarge 56` (splash only), `buttonSmall 32`, `iconBtn 40`, `iconWell 36`, `header 52`; icon glyphs `iconHeader 22`, `iconRow 18`, `iconMeta 14`.
- **Elevation:** `Shadow.card`, `Shadow.raised`, `Shadow.clay` (kid elements only), `Shadow.focusRing`, `Shadow.none`, all forest-tinted CSS `boxShadow` strings. No `shadowColor`/`elevation`. Never put `boxShadow` and `overflow: 'hidden'` on the same view.
- **Borders vs shadows:** plain cards are white, `Radius.lg`, padding 16, one hairline `border`, **no shadow** (`GlassCard elevated` is a no-op except on `tone="forest"`). Shadows only on the hero, the tab bar and floating elements (FAB, AI button). No 1.5-3 px decorative borders: chips 1 px; inputs keep the 1.5 px `fieldBorder` (accessibility).

### Declutter rules (one look across every screen)

- **One hero per screen**, the only card with `Shadow.card` (padding 20, `Radius.xl`). No nested cards: a row inside a card is never itself a bordered or filled box.
- **Icon wells** only in list rows: 36x36, `Radius.md`, icon 18. None inside hero stat tiles or confirm-summary rows.
- **One primary button per screen** (the sticky bottom CTA counts): `GradientButton` `md` 48.
  - Secondary actions: `GradientButton variant="ghost"` or `TextButton` (15 SemiBold `secondary`, no fill/border, 44 hit area, optional `chevron`).
  - Small inline actions (Book, Mark given): `variant="outline" size="sm"` (32 high, 1 px `borderStrong`, 13 SemiBold forest).
  - Destructive (Sign out, Cancel): `variant="danger"` text button.
  - Header icon buttons: `HeaderIconButton` 40x40, no fill, no border, icon 22.
- **Headers:** every stack screen uses `components/ScreenHeader` (plain `arrow-back` 22 in a 40 hit area, 17 SemiBold title left-aligned, optional `subtitle` and `right` slot, height 52, no bottom border). Tab headers: title in `heading` (22), no subtitle line, at most one right icon plus the avatar (36).
- **Meta text:** no icons in front of dates or doctor names in list rows; join plain text with " · ".
- **Badges:** at most one per row or card, never repeating what the icon or text says. Status is a coloured icon **or** a `StatusPill`, not both. Use `StatusPill dot` (6 px dot + label) for calm statuses in lists.
- **Sprout:** at most one per screen. Empty sections inside a populated screen use a one-line text empty state (`EmptyState compact` or `consult/EmptyStateCard`), never an illustration.
- **Accents:** sunshine / peach / sky at most once per screen. No `GradientBackground variant="welcome"` blobs except on splash.

## 4. Motion

`Motion` in theme.ts; `components/ui/useMotion.ts` wraps reanimated `useReducedMotion()` and provides safe `haptic()`.

- Animate **transform and opacity only** (plus `interpolateColor` for press backgrounds). Use `.get()` / `.set()` on shared values (React Compiler is on).
- Press: scale 0.97, 120 ms in, spring out `{damping 15, stiffness 220}` via `PressableScale`.
- `springBouncy {damping 12, stiffness 180, mass 0.8}` for celebrations, sticker pop, tab icon pop, Sprout entrance.
- Progress bars: a full-width fill inside an overflow-hidden track, slid with `translateX` (keeps the round cap round). `AnimatedProgress`.
- Lists: stagger at most the first 6 items, first mount only.
- **At most one looping animation per screen**, paused on blur.
- **Reduced motion:** no confetti, no loops, instant tab pill, plain fades, static Sprout, progress jumps to value.
- Haptics: selection on tab change and single-select chips; light impact on primary CTAs; success on celebrations; warning on OTP failure. Never on multi-select lists.

## 5. Kid-friendly layer

**Guardrail:** playfulness frames health information and never replaces it. Doses, dates, symptoms, red flags, prescriptions and doctor notes stay plain, high-contrast text. **No mascot** on danger / red-flag content, prescriptions, record detail, doctor chat or video.

- **Sprout** (`components/mascot/Sprout.tsx`): moods `happy | cheer | think | sleepy | care | wave`. Decorative (hidden from screen readers). Only the wrapping view moves (bob or one-shot entrance pop), never SVG props. Placements: splash (wave, entrance pop), login/signup, onboarding topic intros (via `OnboardingShell sprout=`), onboarding complete (cheer, idle bob), home greeting (wave, idle bob), home check-in card and consult hero (care), check-in intro (care, idle bob), chat AI avatar (static `SproutArt`), typing indicator (think), empty states, celebration card, booking confirm (cheer).
- **Celebrate** (`components/celebrate/`): one shared progress value drives 14-20 confetti pieces from bottom-centre plus a bottom card with Sprout. Announces for screen readers; no auto-dismiss when a screen reader is on. Fired after "mark dose as given" (bigger burst when nothing is due or overdue, once per session) and on onboarding complete. Never on app open.
- **Stickers** (`components/ui/Sticker.tsx`): reward **logging only**, never body size or percentile. Growth sticker shelf (1, 3, 5, 10 measurements logged). Unearned slots use a solid `borderStrong` outline and a lock.
- **ChildAvatar** (`components/ChildAvatar.tsx`): ring in the child's own colour, initial on the child's soft surface. Optional static progress arc only where the data is already loaded.
- **EmptyState** (`components/EmptyState.tsx`): Sprout + one prop on a green blob, title, short body, optional action. Inside a populated screen use `compact` (no Sprout).
- **Friendly accents:** QuickActions wells (mint, sky, sunshine, peach), tip-card wells, splash sun.
- **Warm copy:** child's name, second person, short sentences, no baby talk, at most one "!" per screen, no cute language on warnings.

## 6. Components

- `GradientButton` (name kept): `dark` forest pill with a white arrow circle (also the CTA on light-green heroes), `light` white pill with a black arrow circle (solid forest only), `outline` (1 px `borderStrong`), `ghost` (text-only secondary), `danger` (text-only destructive). Sizes `md` 48 (**default**, arrow circle 32, label 15), `lg` 56 (splash only, circle 44), `sm` 32 (inline outline pill, label 13, no arrow). `chevron` on ghost/danger. `loading`, real disabled state (sage fill, muted label, no opacity). `TextButton` is exported from the same file.
- `ScreenHeader` + `HeaderIconButton` (`components/ScreenHeader.tsx`): the one stack-screen header (see Declutter rules). `CheckinHeader` wraps it with a canvas fade and a status dot.
- `GlassCard` (name kept): white hairline card, padding 16, no shadow; `tone` mint / sunshine / info / forest (= light-green glass hero, padding 20, shadow with `elevated`).
- `HeroCard` / `HeroBackdrop` / `heroCardStyle` / `HeroBadge` (`components/ui/HeroCard.tsx`): the light-green glass hero and its pill (badge always `sm`; the `size` prop is ignored).
- `TabScreenLayout`: floating title row (`TAB_HEADER_HEIGHT` 64, header paddingBottom 12) with a canvas fade; scroll content gap 24.
- `OnboardingShell`: plain 40 back icon, gutter 20, title `heading` 22, Sprout 48 (pass `sprout` on the first step of a topic only), CTA `md` 48, field-group gap 20.
- `TextInputField`: label 13 SemiBold above; 48 high, 1.5 px `fieldBorder`, input text 16 (stops iOS zoom); focus = `secondary` border + `Shadow.focusRing` (browser outline suppressed on web); `hint` renders as a 12 muted line **under** the field (`hintInline` puts a short unit beside the label); `error`, `leading`.
- `ChipGroup`: white chips, 1 px hairline, about 34 high, 13 Medium; selected = mintSurface + mintBorder + forest label + check.
- `EmptyState`: full version = Sprout 64 on a 96x80 blob, title 17, 13 body, optional action. `compact` = no Sprout or blob, title 15 SemiBold + 13 muted body, ghost action, centred, paddingVertical 16.
- `StatusPill`: 24 high, 12 Medium, icon 12; `dot` mode for list rows.
- `PressableScale`, `AnimatedProgress`, `Sticker`, `useMotion` / `haptic` in `components/ui/` (re-exported from `components/ui/index.ts`).
- Home: `PrimaryCtaCard` (hero, title 17 Bold, Sprout 56, optional `badge`, optional `secondaryLabel` / `onSecondary` ghost link), `GrowthCards` (one card, two columns, `number` 22 + `unit`, optional `onPress`), `VaccinationCard` (36 well, one StatusPill, plain chevron), `CareTeam` (36-avatar rows in one card + "Add a doctor" text button), `HomeHeader` (avatar 36, borderless name pill, 40 bell with no fill).
- Consult: `AiCheckinHeroCard` (title 22, Sprout 56, no badge), `DoctorCardCompact` (row: avatar 36, name 15, specialty 13, outline `sm` "Book"; `inList` / `divider` for rows inside one card; lay out vertically), `AppointmentCard` (plain meta line, Join = primary `md`, Details = ghost, Cancel = danger text), `EmptyStateCard` (one 13 muted line in a hairline card).
- Check-in: `SymptomTile` (88 high, even 2-column grid via flexBasis; the `size` prop is ignored), `SummaryCard` (one card, title 17, hairline rows, no nested boxes).
- `GradientBackground` (name kept): flat sage canvas; `variant="welcome"` adds two static blobs (splash only).
- Tab bar: subtly glassy floating bar (translucent white, hairline, iOS-only light blur), mint pill slides behind the active icon, icon pop, 12 px labels, forest AI button (52) with mint sparkles.

## 7. Do / Don't

- **Do** use tokens for every colour, and pair every status colour with an icon and a label.
- **Don't** use purple anywhere, or any alpha-suffix tint.
- **Don't** use mint as text or as a progress fill on light surfaces.
- **Don't** use `outline` as text except on pure white; inputs and checkboxes use `fieldBorder`.
- **Don't** show Sprout on warnings, prescriptions, record detail or video.
- **Don't** run more than one loop per screen; always provide the reduced-motion fallback.
- **Don't** let stickers or copy judge a child's body.
- **Don't** use emoji as icons; use Ionicons (outline inactive, filled active). Touch targets >= 44 pt.
