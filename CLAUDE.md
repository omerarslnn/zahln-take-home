# CLAUDE.md

Guidance for AI coding sessions in this repository. Keep it short and true; update it when facts change.

## The task

ZAHLN frontend take-home "The Mensa Lunch Rush": one payment flow across three surfaces in one
TypeScript monorepo, against a deliberately unreliable mock API (`https://dev.zahln.de`).

- `apps/student` (Expo, iOS + Android): pick a seeded user (student, staff or guest), scan a till QR,
  see mensa, items and amount, confirm with biometrics or PIN, see the result; payment history
  (including payments still being checked) with a detail view.
- `apps/till` (Expo, tablet): ring up an order from the menu and show its QR, show the payment result,
  refund in full or in part with a clear error when refunding is not allowed.
- `apps/dashboard` (React + Vite, web): daily totals per mensa and per till, payments that need
  attention, search with full history per payment, CSV export.

Required: an installable Android build, the dashboard on a public URL, German and English on every
screen that is built, and a pay flow that works with a screen reader. Evaluation order: correctness
(money never moves twice, no screen shows an untrue result), ownership, product quality, shippability,
code quality.

Sources: the task PDF, Gaurav's API email and the job posting are local-only in `brief/` (git-ignored).
The API contract used by the code is `packages/api/openapi/openapi.json`, a byte-identical copy of the
supplied file. Never modify `brief/`. Record live-spec differences in `docs/api-notes.md`.

## Current stage

Stage 4 (finance dashboard) is done and deployed: https://zahln-mensa-dashboard-4ft.pages.dev/
(Cloudflare Pages project `zahln-mensa-dashboard`, direct upload of a local build). The core payment
and refund flows passed on a Pixel XL, an iPad A16 and an iPhone 17 Pro on 2026-11-04; screen
readers, maximum font sizes and some recovery cases are still to run (`docs/progress.md`, Phase 0).
Phase 0 (baseline) and Phase 1 (BUG-01: payment availability re-checked in the foreground, one live
warning; student build 4) are done; N9 passed on the Pixel XL. Phase 2 (design system: tokens,
native primitives, `docs/design-system.md`) is approved. Phase 3 (typed and demo sign-in, roles
checked before a session is published, the apps following the device language; student build 5,
till build 4) passed eight smoke checks on the Pixel XL. Phase 4 (the student screens redesigned,
student build 6) passed 7 of 8 Pixel XL checks (TalkBack deferred, not run). Phase 5 (the till
screens redesigned, `expo-keep-awake`, till build 5) passed eight aggregate checks on the iPad and
the Pixel XL. Phase 6 (final QA and release preparation: student build 7, till build 6, the
dashboard redeployed from `4fe08aa`, the APKs in the draft release `v1.0.0-final`) is done; the
owner reports the screen-reader checks SR1–SR3 (TalkBack, VoiceOver) passed. Phase 7 redesigned
the finance dashboard (Export CSV beside the Payments heading; a long export is saved with "Save CSV
file") and redeployed it from `6ff2308` to the same URL; it awaits the owner's review. Do not publish
the release, invite reviewers or submit without the owner's approval.

Live writes go only through intents (the apps, `pnpm api:order-probe`, `pnpm api:payment-probe`) and
only when the current stage authorizes them; record each one in the ledger in `docs/api-notes.md`.
Never add an automatic offline payment queue or a background payment retry: writes happen only on a
user action.

## Commands

```sh
pnpm install            # pnpm 10.34.9 via Corepack (packageManager field); fetches pinned Node 24.22.2
pnpm toolchain          # prints the Node.js/pnpm that actually run project scripts
pnpm check              # format:check + lint + typecheck + test + single instances + copies + dashboard build
pnpm check:copies       # the student and till copies of shared native code are identical
pnpm student | pnpm till | pnpm dashboard     # Metro 8081 | Metro 8082 (till dev build; s = Expo Go) | Vite 5173
pnpm bundle:native      # expo export for iOS and Android (both apps)
pnpm api:generate       # regenerate packages/api/src/generated from the contract copy
pnpm api:smoke          # opt-in live check: GET /config, POST /sessions, GET /mensas, CORS preflights
pnpm api:spec-diff      # opt-in: compare the live OpenAPI document with the committed copy
pnpm api:order-probe    # opt-in, WRITES one live cashier order (QR format probe); see README
pnpm api:payment-probe  # opt-in, WRITES one live order + payment, records settlement; resumes on re-run
pnpm dashboard:browser-check   # read-only: built dashboard in headless Chrome vs the live API (--url, --idle)
pnpm apk:student | pnpm apk:till   # release APKs (debug-key signed, commit in the file name)
```

Run tools through `pnpm` so they get the pinned Node.js (`useNodeVersion` in `pnpm-workspace.yaml`,
mirrored in `.nvmrc` and `engines`). The system `node` on this Mac is 23.11 and is not used by scripts.

## Boundaries

- Dependency direction: `apps/* → @mensa/domain → @mensa/api`, and `apps/* → @mensa/shared`.
  `api` and `shared` do not import each other. Dashboard-only rules live in `@mensa/domain/finance`,
  an entry point the native apps never import (Metro does not tree-shake).
- `packages/*/src` is platform-neutral: no `react-native`, `expo*`, `nativewind`, `react-dom`,
  `node:*`, `process`, `window`/`document`. ESLint enforces this. React-only bindings live under
  `@mensa/shared/react`.
- Never hand-edit `packages/api/src/generated/`. Change the contract copy deliberately, then
  `pnpm api:generate`.
- No `console` in app or package source: tokens, passwords, bodies, amounts tied to users and
  personal data must never be logged.
- Native apps read config only as literal `process.env.EXPO_PUBLIC_*`; the dashboard uses `VITE_*`.
  Both are public (inlined into bundles). No secrets in any client env: the one password there,
  `EXPO_PUBLIC_SEEDED_PASSWORD`, is the mock's published test password; keep it in memory only.

## Payment invariants

Invariants 1–10 are enforced in `@mensa/domain` and `@mensa/api`, covered by deterministic tests
against the simulated server (mutation-checked; see `docs/progress.md`), and used by the screens: they
show the server's amount, pay exactly that and show only `confirmed` as paid. 11 is for the stage 4
dashboard; 12 is implemented as a device gate.

1. Money is integer cents (EUR). The API resolves prices by the authenticated payer's price group;
   the client never computes a price. It sends back the amount it showed (`amount_mismatch` guards).
2. The QR identifies the order (`qrPayload`), not an amount. Observed format:
   `zahln://pay?order=<orderId>` (`parseOrderQr`, `docs/api-notes.md`). Never fetch a scanned URL;
   load the order from the configured API origin.
3. One persisted idempotency key and one immutable request payload per intent (order, payment,
   refund). Every retry of that intent reuses both; a new key means a new intent. The server keeps
   keys for 24 hours per user, so a record older than that must be reconciled by reading, not resent.
4. A timeout, `502 connection_dropped`, `504 timeout` or missing response after a write is an
   unknown outcome, not a failure. `pending` is not `confirmed`; only `confirmed` means paid. No
   optimistic payment success, ever.
5. A stale read cannot establish that an ambiguous write never happened.
6. Reconcile orders and payments by `version` across mutation responses, polling, lists and details;
   never replace a higher version with a lower one (`newerOf`). Observed exception: order expiry keeps
   the version, so `isLaterOrderState` accepts `open` → `expired` at an equal version, and nothing else.
7. Scope caches and recovery records to candidate ID and user ID.
8. Re-authentication (`401 session_expired`, or `401 unauthorized` once a token has been expired for
   about a minute; tokens last at most 5 minutes) must preserve the pending intent and must never let
   it continue under a different account.
9. Server time (`Date` header) governs expiry. Local expiry never resolves an outstanding payment.
10. Refunds have their own `pending`/`completed`/`failed` lifecycle; pending refunds reserve
    refundable capacity.
11. Finance reports use Europe/Berlin days. CSV export follows every page (cursor) of the selected
    filter, not only the visible page.
12. Local biometric or PIN confirmation is a device-side gate. The mock API cannot verify it, so it
    is not server-verifiable payment approval. `PaymentAuthorizer` binds one prompt to user, order,
    amount and review; cancel or no screen lock sends nothing.

## Conventions

- Strict TypeScript everywhere. Expo SDK 54 is pinned on purpose: it was the newest SDK the Mac's
  Xcode (then 26.1.1) could build; the Mac now has Xcode 26.6, but an SDK upgrade is its own change,
  not part of the review. React 19.1.0 everywhere, exact pins.
- App version: `expo.version` in `apps/*/app.json` (1.0.0, the server's `minAppVersion`), read at
  runtime as `appVersion` in `apps/*/src/api.ts` and sent as `X-App-Version`. Bump it there; generated
  native projects pick it up on the next `expo prebuild --clean`. Raise `android.versionCode` and
  `ios.buildNumber` (now student 7, till 6) for each build handed to a device.
- Payment availability: `GateRecovery` (`@mensa/domain`) decides when `GET /config` is read again
  (start-up, foreground, connection back, a few spaced retries after a failed read, the user's
  "check again"); only the server's answer opens the gate, and only its newest read counts. The
  student passes `gateChecks` with `expo-network` as the connectivity hint; the till passes none.
  Screens derive their one availability notice from the live gate and never store a copy of it.
- `expo-dev-client` is a till dependency for its iPad development build only. Keep it out of
  release builds: Android autolinking excludes its modules (`apps/till/package.json`), its plugin
  generates no `exp+` scheme (`apps/till/app.json`), and pnpm does not hoist it
  (`pnpm-workspace.yaml`), or the student app picks up its config plugin. After changing any of
  these, compare a release APK's manifest, permissions and size with the previous build.
- Never commit `ios.appleTeamId`: the personal signing team lives in the git-ignored `apps/*/ios`
  projects; Expo CLI writes it into `app.json` after a clean iOS prebuild.
- Android builds need JDK 17. `~/.gradle/gradle.properties` on this Mac pins JDK 11 globally; leave it,
  and build through `pnpm apk:*`, which passes `-Dorg.gradle.java.home` for JDK 17.
- Styling: NativeWind 4 + Tailwind 3 with the shared preset `@mensa/shared/tailwind-preset`
  (tokens in `packages/shared/src/tokens/tokens.json`; rules in `docs/design-system.md`). Both apps
  set NativeWind's `inlineRem: 16` (its native default, 14, broke the 4-point grid). Use token
  classes and the type steps (`text-title`, `text-headline`, `text-body`, `text-caption`,
  `text-display`), never hex values; a new colour pairing needs a contrast test. Minimum touch target 48. NativeWind ignores `className` on `KeyboardAvoidingView` (give it a style, as `Screen` does).
  Exactly one copy of react, react-native, react-native-css-interop and nativewind may exist: an
  optional peer that differs between apps (react-native-svg did) duplicates css-interop, and
  `pnpm check:instances` fails.
- Native primitives live in `apps/*/src/components/ui/` (Button, Notice, ListRow, TextField…).
  Nothing interactive goes inside an `accessible` group (VoiceOver cannot reach it): `Notice` takes
  strings and `actions`, never children. Icons are Ionicons through `Icon`, always decorative. The
  design catalogue (Diagnostics → Design system) exists only under `__DEV__`.
- Sign-in: every sign-in goes through `SignInFlow` (typed or demo) and `SessionCoordinator.signIn`;
  each app passes its roles (`PaymentServicesProvider roles`, `acceptsUser`), checked before the
  session is published. No sign-up or password reset (the API has none). Credentials stay in memory
  for the re-login only and are dropped on sign-out and refused sign-ins; never persist or log them.
- Language: the native apps follow the device language (`src/language.tsx`, German otherwise
  English). No language switch on normal screens; Diagnostics has a session-only override, never
  persisted. Every new string needs English and German. The dashboard keeps its own switch.
- Student and till screens are a container (hooks, guards, navigation) and a pure `…View` (props
  only); keep payment rules out of views. The development-only "Payment screen states" (student) and
  "Till screen states" (Diagnostics, `__DEV__`) render the views from sample data; add a state there
  when a view gains one.
- The till keeps the screen awake (`expo-keep-awake`) only while `keepAwakeWanted` holds: a shown,
  focused order that is `open` or `paying`, app in the foreground. Anything ticking every second
  (the countdown) lives in its own small component, never in a screen that renders the menu or the
  QR code.
- Screen-reader announcements go through `useAnnouncement` only (both platforms, focused screen
  only, once per change); never also an Android live region for the same message.
- The dashboard keeps nothing in localStorage or cookies, and uses hash routes (`#/…`).
- Side-by-side columns need `collapsable={false}` and `importantForAccessibility="yes"`, or Android
  screen readers mix their contents by screen position (see the till's `CheckoutScreen`).
- Comments explain decisions, not syntax. JSDoc on public functions. Keep functions short enough to
  explain in an interview.
- Tests: `node:test` via `tsx`, colocated `*.test.ts`, only for behaviour worth protecting; the root
  `pnpm test` runs `packages/*/src`, `apps/student/src` and `apps/dashboard/src`. Test
  doubles live in `packages/*/src/testing/` and are never exported from a package index (Metro does
  not tree-shake; they would ship in the app bundles).
- The student and till apps keep identical copies (apart from the header comment naming the other
  copy) of the files listed in `scripts/check-native-copies.mjs`: `src/components/ui/`, `src/api.ts`,
  `src/payments/*` (except the student-only `connectivity.ts`), a few components, the catalogue and
  the Metro/Tailwind/Babel configs. Change both; `pnpm check:copies` fails on any drift. Their tests
  live with the student copy.
- Keep `docs/progress.md`, `docs/api-notes.md` and `docs/manual-tests.md` in step with actual
  results; mark checks as passed, failed, blocked or not run.
