# Design system

The visual foundation of Mensa Pay (student) and Mensa Till: tokens, native primitives and the
rules for using them. Screens are redesigned on top of it in later phases; this document says how.

## Principles

- **Calm and clear.** A payment app is used in a queue, in a hurry. One primary action per screen,
  generous whitespace, no decoration that competes with the amount or the status.
- **Native, not themed.** System fonts (SF Pro on iOS, Roboto on Android), platform navigation,
  platform spinners. The design system adds tone and order, not a foreign look.
- **Truth before style.** Statuses come from the server and keep their words; colour and icons only
  repeat what the words say. Nothing looks paid, available or done unless it is.
- **Accessible by construction.** Contrast is tested, every control is at least 48 dp, and the
  primitives' structure keeps screen readers' navigation predictable (see _Accessibility_).
- **Few, real parts.** A small set of primitives that the screens actually need; no speculative
  components.

## Tokens

One source: `packages/shared/src/tokens/tokens.json`. TypeScript reads it through
`@mensa/shared` (`colors`, `typeScale`, `space`, `radius`, `iconSize`, `touchTarget`, `motion`);
the Tailwind preset (`packages/shared/tailwind-preset.cjs`) turns it into classes for the native
apps (NativeWind) and the dashboard. Every existing token kept its name and value, so the dashboard
is unchanged (its CSS file is byte-identical); it can adopt the new tokens later.

### Colour

| Token (class)                               | Value                           | Use                                                       |
| ------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| `brand`                                     | `#1D4ED8`                       | Primary actions, links, focus                             |
| `brand-strong`                              | `#1E40AF`                       | Pressed primary; pending text on tint                     |
| `brand-subtle` / `brand-line`               | `#EFF6FF` / `#BFDBFE`           | Pending (in progress) tint and its hairline; pressed tint |
| `brand-on`                                  | `#FFFFFF`                       | Text on brand and danger                                  |
| `ink` / `ink-muted`                         | `#111827` / `#4B5563`           | Primary / secondary text                                  |
| `surface` / `canvas`                        | `#FFFFFF` / `#F3F4F6`           | Cards / screen background                                 |
| `fill`                                      | `#E5E7EB`                       | Disabled controls, skeletons                              |
| `line`                                      | `#6B7280`                       | Boundaries a control needs (text fields): 3:1             |
| `line-subtle`                               | `#E5E7EB`                       | Decorative hairlines and dividers only                    |
| `success`, `warning`, `danger`              | `#15803D`, `#B45309`, `#B91C1C` | Semantic text, destructive buttons                        |
| `*-strong` (`success`, `warning`, `danger`) | `#166534`, `#92400E`, `#991B1B` | Text and icons on their tint; pressed destructive         |
| `*-subtle` / `*-line`                       | 50 / 200 steps of each hue      | Banner and status tints and their hairlines               |

Contrast is not a table to keep in sync but a test: `packages/shared/src/tokens/contrast.test.ts`
checks every allowed text pairing at 4.5:1 and every control boundary at 3:1 (WCAG AA), and
`apps/student/src/components/ui/styles.test.ts` checks the primitives' actual style tables
(banners, pills, every button tone at rest and pressed, icons at 3:1). The lowest allowed text
pairing is 5.02:1 (success and warning text on white); `line-subtle` (1.24:1) is tested to stay
decorative only: it must never be the only boundary of a control.

**Dark mode** is not built. The tokens are named by role (`surface`, `ink-muted`, `*-subtle`), not by
hue, so a dark theme is a second value set for the same names; `app.json` keeps
`userInterfaceStyle: light` until then.

### Type

System fonts only, no font loading. Five steps (`text-…` classes, sizes / line heights in dp):

| Step       | Size / line | Weight   | Use                                     |
| ---------- | ----------- | -------- | --------------------------------------- |
| `display`  | 40 / 48     | bold     | The one amount a screen is about        |
| `title`    | 28 / 34     | bold     | Screen title (one per screen, header)   |
| `headline` | 18 / 24     | semibold | Section and card headings (header)      |
| `body`     | 16 / 24     | regular  | Everything else; button labels semibold |
| `caption`  | 13 / 18     | regular  | Times, IDs, notes; always `ink-muted`   |

Amounts use tabular figures (`AmountText`, `tabularFigures`), so columns of money line up and a
value does not jitter while it updates. Text scales with the system setting and wraps; nothing in the
primitives truncates (`numberOfLines` is not used).

### Spacing and layout

A 4-point grid: Tailwind's scale (`1` = 4 dp … `4` = 16 dp … `6` = 24 dp). Until this phase it was
not one on the phones: NativeWind's default `rem` on native is 14, so `p-4` was 14 dp and body text
14 dp. Both apps now set `inlineRem: 16` (`metro.config.js`), which makes the scale identical to the
web's. Screens: 16 dp gutters (`space.gutter`), 16 dp between blocks, 12 dp between stacked items
inside a card (`space.stack`). Avoid half steps except for optical alignment.

### Shape, borders, elevation, size

- **Radii**: `rounded-control` 10 (buttons, fields), `rounded-card` 14 (cards, banners),
  `rounded-full` (pills, icon buttons).
- **Borders**: 1 dp. Cards and banners are outlined by their hairline; fields by `line`.
- **Elevation**: by tone and hairline, not drop shadows. A card is a white surface on the grey
  canvas; the bottom action bar is separated by a hairline. Shadows render differently on iOS and
  Android (Android elevation only casts downwards) and add nothing to a flat, calm layout; a raised
  token can be added when a floating element (a sheet) needs one.
- **Touch targets**: `min-h-touch` / `min-w-touch` = 48 dp (Material; above Apple's 44 pt).
- **Icons**: `sm` 16, `md` 20 (next to body text), `lg` 24, `xl` 32.

## Native primitives

`apps/*/src/components/ui/`, imported from `../components/ui`. The student app and the till keep
identical copies (see _Two apps, one set of primitives_). Pure parts (style tables, spoken labels)
live in `styles.ts` and `a11y-text.ts` and are unit-tested in Node.

| Primitive                                                                     | Responsibility                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Screen`                                                                      | Scrolling body on the canvas, gutters, safe area, keyboard; `footer` goes into a `BottomActionBar`; `headerless` keeps the status-bar area opaque on a screen without a nav bar  |
| `BottomActionBar`                                                             | Persistent actions: above the home indicator, directly on the keyboard while it is open                                                                                          |
| `Title`, `Heading`, `Body`, `Caption`                                         | The type scale; `Title` and `Heading` are announced as headers                                                                                                                   |
| `Button`                                                                      | `primary` / `secondary` / `tertiary` / `danger`; disabled is grey for every tone; `busy` shows a spinner over the label, which keeps its place, so the button never changes size |
| `IconButton`                                                                  | 48 × 48 dp, icon only, a required spoken `label`                                                                                                                                 |
| `Card`, `Section`                                                             | A white surface with a hairline and an optional heading; a titled group without a surface                                                                                        |
| `LabelledValue`                                                               | "Label: value", read as one phrase                                                                                                                                               |
| `ListRow`                                                                     | Title, status, subtitle, trailing value, chevron when it opens something; optional leading `icon`, `busy` (spinner for the chevron) and `disabled`; read as one phrase           |
| `StatusPill`                                                                  | A tone's icon and words on its tint                                                                                                                                              |
| `Notice`                                                                      | A banner: icon, title, description as one accessible group; `actions` outside it                                                                                                 |
| `AmountText`                                                                  | Server cents in the current language's format, tabular figures; it never calculates                                                                                              |
| `TextField`                                                                   | Visible label, hint, error (icon + text), every keyboard prop and an optional `trailing` control inside the border; one stop for screen readers (the control is its own stop)    |
| `PasswordField`                                                               | A `TextField` hidden by default, marked as the current password for autofill, with a show/hide `IconButton` labelled by what it does next                                        |
| `EmptyState`                                                                  | Icon, words and an optional action for "nothing here"                                                                                                                            |
| `LoadingIndicator`, `Skeleton`                                                | Spinner with words, read once; placeholders hidden from screen readers that pulse unless reduced motion is on                                                                    |
| `Icon`                                                                        | Ionicons, decorative only, scaling with text up to 1.5×                                                                                                                          |
| `useAnnouncement`, `useAccessibilityFocus`, `useAppActive`, `useKeyboardOpen` | The one announcement path, focus moves, foreground and keyboard state                                                                                                            |

Tones (`ok`, `pending`, `warning`, `error`, `neutral`) are one vocabulary for pills, banners and
inline statuses; each has its own icon (`checkmark-circle`, `time`, `alert-circle`, `close-circle`,
`information-circle`), so tones differ without colour. `toneIcon(tone)` gives a screen the same icon
for a status shown inline next to a sentence.

Primitives carry no business logic: they take words, cents and callbacks. Which status a payment
has, what an amount is and whether an action is allowed stay in `@mensa/domain` and the screens'
pure mappings (`payment-outcome.ts`, `availability.ts`, `payment-text.ts`).

### Catalogue

In development builds Diagnostics links to **Design system**: every primitive in its states, the
colour tokens and the type scale. It is registered only under `__DEV__`, so release bundles do not
contain it (checked: none of its strings is in the exported Hermes bundles). Its sample texts are
English on purpose: it is a review tool, not a product screen.

## Accessibility conventions

- **Nothing interactive inside an accessible group.** A view with `accessible` is one element to
  VoiceOver: it does not navigate into it, so a button inside cannot be reached. Before this phase,
  13 notices had buttons inside their group (retry on a failed order load, "Show status" of an
  unresolved payment, camera permission, refund confirmation on the till…). `Notice` now takes plain
  `title` and `description` strings for its group and renders `actions` beside it; it accepts no
  children, so TypeScript rejects a button inside the group. `ListRow` and `TextField` follow the
  same rule from the other side: their parts are hidden and the element speaks one phrase.
  On Android the accessibility tree shows the change: "Allow camera" was inside the notice's
  focusable group in build 4 and is a separate element now. A physical VoiceOver pass (A1–A4) is
  still to confirm it on iOS.
- **Labels, roles, states**: buttons have `accessibilityRole="button"`, a label and, where useful, a
  hint; disabled and busy are `accessibilityState`, and Android reads "busy". Headers are
  `accessibilityRole="header"`. Icons are always hidden; the words carry the meaning.
- **Fields**: the error is part of the field's spoken label (users can switch hints off; an error
  must not go unheard), and the visible label, hint and error are hidden so nothing is read twice.
- **Announcements** go through `useAnnouncement` only: on the focused screen, once per change, never
  also in an Android live region. Loading states have words but no role that makes screen readers
  repeat them.
- **Focus**: `useAccessibilityFocus` moves focus to a new heading after layout; actions follow their
  text in reading order.
- **Large text**: everything wraps; icons grow with the text up to 1.5×. Checked on the Android
  emulator at 130 % (the Pixel XL's largest) and 200 % (the sign-in screens at 200 % in Phase 3).
- **Fields keep focus while a form is sent.** A field that becomes non-editable loses focus, and
  Android moves keyboard focus to the next control (seen in Phase 3: after a failed sign-in, focus
  sat on "Show password"). Fields stay editable while a request runs; the button shows the busy
  state and a second submit sends nothing.
- **Colour is never alone**: every status has words and an icon.

## Motion

Motion is feedback, not decoration. Pressed states change colour instantly (no animation); the only
animation in the primitives is the skeleton's gentle opacity pulse (`motion.pulseMs`), with
Reanimated (already a NativeWind dependency), and it stays still when the system asks for reduced
motion (`useReducedMotion`). Screen transitions are the native stack's own, which follow the
platform's reduced-motion setting.

## Dependencies

| Decision                                         | Why                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accepted**: `@expo/vector-icons` 15 (Ionicons) | Already installed as a dependency of `expo` (the same 15.1.1; `expo install --check` passes), no native code: the font loads through `expo-font`, which both apps already link. One coherent icon family for iOS and Android. Cost: the Ionicons font (390 kB, compressed in the APK) and its 36 kB glyph map; arm64 release APKs grew 276 kB (student, against build 4) and 281 kB (till, against build 3), permissions unchanged. |
| Rejected: `react-native-svg` icon sets           | It duplicated `react-native-css-interop` before (an optional peer that differed between the apps), which breaks NativeWind.                                                                                                                                                                                                                                                                                                         |
| Rejected: custom fonts                           | System fonts are faster, need no loading and match each platform.                                                                                                                                                                                                                                                                                                                                                                   |
| Rejected: Lottie or an animation framework       | Nothing needs it; Reanimated is already present.                                                                                                                                                                                                                                                                                                                                                                                    |
| Deferred: haptics, keep-awake                    | Belong to the feature phases that need them (confirming a payment, the till's QR screen).                                                                                                                                                                                                                                                                                                                                           |
| Rejected: Jest + React Native Testing Library    | A Babel/Jest stack beside `node:test` for a handful of assertions; the primitives' decisions are pure functions tested in Node, and their structure is enforced by types (`Notice` has no children).                                                                                                                                                                                                                                |
| Rejected: a shared native UI package             | See below.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Possible later: a subset icon font               | The app uses about 15 of 1,300 glyphs; a subset font would save most of the 390 kB, at the cost of a generated asset to maintain.                                                                                                                                                                                                                                                                                                   |

## Sign-in screens (Phase 3)

Both apps' sign-in screens are built only from these primitives, plus two shared building blocks in
`components/SignIn.tsx` (identical in both apps): `BrandHeader` (the app's mark, its name as the
screen's heading and one line about it) and `SignInForm` with its state hook `useSignIn`.

- **No navigation bar** (`Screen headerless`): the brand header is the screen's title.
- **Form**: username (`autoComplete="username"`, `textContentType="username"`, no capitalisation or
  correction, return key "next") and a `PasswordField` (return key "go" submits). Empty fields are
  reported at the fields on submit, without a request; the error is part of each field's spoken
  label and is announced once. One failure notice above the fields, with a distinct message for
  refused credentials, no connection, a server that does not answer, a wrong role, a missing demo
  password and missing settings. After refused credentials or a wrong role the password is cleared
  and the username kept.
- **Demo accounts** are `ListRow`s in a card: one tap signs in; the row being signed in shows a
  spinner and the others are disabled until it finishes. The student app lists Student, Staff and
  Guest with an icon and one line each; the till lists the cashiers grouped by the mensa the API
  description names for them.
- **Till layout**: at 768 dp and wider two columns (brand and form left, demo cashiers right), each
  column one screen-reader group; narrower, one column.
- **Diagnostics** is a tertiary button at the end, so it never competes with signing in.
- **Honest scope**: a footnote says that this demo has no registration. There is no sign-up, no
  password reset and no price-group choice (the server decides the price group).

Screenshots: Android emulator, phone (EN, 200 % text) and tablet width; see
[progress.md](progress.md), Phase 3.

## Language

The apps follow the device's language preference (on Android 13+ and iOS also the app's own
language setting): German when it prefers German, otherwise English. Normal screens have no
language switch. Diagnostics has a session-only override ("Device language (…)", "Deutsch",
"English"; each language named in itself), kept in memory and gone after a relaunch. Implementation
and platform behaviour: [architecture.md](architecture.md#internationalisation).

## Two apps, one set of primitives

The student app and the till keep identical copies of the primitives (`components/ui/`), the
payment wiring and a few building blocks. A shared `packages/native-ui` would need its own pinned
`react-native`, `react`, `nativewind` and `react-native-css-interop` peers, Tailwind `content` paths
in both apps and careful pnpm resolution; a mistake there gives two copies of css-interop, which
silently breaks styling. Copies avoid that, and `pnpm check:copies` (part of `pnpm check`) proves they
match: every listed file must exist in both apps and be identical apart from the header comment
that names the other copy. It compares only the listed paths, so the apps' legitimate differences
(screens, navigation, `App.tsx`) never fail it; a one-line drift or a file added to one copy does.
The tests live with the student copy only.

## Using the system in a screen

1. Wrap the screen in `Screen`; put its one primary action in `footer` (a `BottomActionBar`).
2. Start with one `Title`; group content in `Card`s or `Section`s; use `Heading` inside them.
3. Money is `AmountText` (`display` for the amount the screen is about) with the server's cents.
4. Lists are `ListRow`s inside a `Card`, `separated` after the first row.
5. Statuses are `StatusPill`s (or `toneIcon` inline) with the server's status in words.
6. Problems and notes are `Notice`s with `actions`, never buttons inside the text.
7. Inputs are `TextField`s (`PasswordField` for a password); validate on submit and announce the
   result with `useAnnouncement`. Set the native input props: `autoComplete`, `textContentType`,
   `returnKeyType` and `onSubmitEditing` to move to the next field or submit.
8. Use tokens through classes or `@mensa/shared`; no hex values, no `text-xs`/`text-2xl` sizes and
   no `border-line` for decorative dividers (use `line-subtle`).
9. Every string goes through `t()` with an English and a German entry; screens never offer a
   language switch (the app follows the device; see _Language_).

**Not migrated yet** (screen redesign phases): the screens still use raw Tailwind classes for their
titles and some rows (`text-2xl` headers, `border-line` dividers in the till's menu and the home
list), and the payment history rows nest an accessible status pill inside a button: on Android the
row's spoken label omits the status (observed in the accessibility tree:
"Mensa am Campus, €7.20, 04/11/2026, 17:03"). `ListRow` exists for exactly this.
