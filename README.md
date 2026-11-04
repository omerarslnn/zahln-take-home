# Mensa Lunch Rush: ZAHLN frontend take-home

One mensa payment flow across three surfaces (student app, till and the Studierendenwerk
dashboard) in one TypeScript monorepo, built against the supplied mock API.

> **Status: stage 4 of 5. All three surfaces are built, and the dashboard is live at
> https://zahln-mensa-dashboard-4ft.pages.dev/** (sign in with the finance demo account). The student
> app pays a till order after a local fingerprint, face or PIN check and shows only the server's
> result; the till rings up orders, shows the QR and refunds; the dashboard shows Berlin daily totals
> per mensa and till, payments that need attention, filtered payments with full history, and exports
> every matching payment as CSV. Verified: unit and simulated-server tests, live API runs on an Android
> emulator, headless-browser runs of the dashboard (locally and on the deployed URL), and the core
> payment and refund flows on a Pixel XL (Android 10), an iPad A16 and an iPhone 17 Pro (Face ID) on
> 2026-11-04. **Not yet verified**: TalkBack and VoiceOver, maximum font sizes, a force-stop with a
> genuinely unresolved payment, a real lost response on a device, and some dashboard manual checks.
> **BUG-01 fixed** in Phase 1 (student build 4) and verified on the Pixel XL (N9, 2026-11-04). Design:
> [docs/design.md](docs/design.md); visual design system: [docs/design-system.md](docs/design-system.md).
> Records: [docs/progress.md](docs/progress.md).

## What exists today

| Part                   | Implemented                                                                                                                                                                                                                                                                                                                     | Shell only / not yet                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `apps/student` (Expo)  | Seeded sign-in, QR scan or typed code, review with the server's amount, local authorization (biometric or device PIN), truthful result with safe resend, paginated history with unresolved actions, payment detail with refunds and history, DE/EN, screen-reader labels                                                        | Screen-reader and maximum-font checks on devices |
| `apps/till` (Expo)     | Seeded cashier sign-in, menu with per-group prices, basket, order with QR and countdown, follows paid/expired across restarts, payer's amount when paid, payment list and search, full and partial refunds, DE/EN, tablet layout                                                                                                | VoiceOver check on the iPad                      |
| `apps/dashboard` (web) | Finance sign-in (public demo account), Berlin daily totals per mensa and till with "last fetched" and failed-refresh states, payments that need attention, filtered cursor-paged payments, payment detail with refunds and history, complete CSV export, DE/EN, diagnostics; deployed on Cloudflare Pages                       | Manual keyboard and screen-reader checks         |
| `packages/api`         | Types generated from the contract, transport (timeouts, headers, Problem parsing, server `Date`, replay flag), typed client for all ten operations with runtime validation, live smoke check                                                                                                                                    | n/a                                              |
| `packages/domain`      | Intents and their controller, write classification, session coordinator, server clock, payment gate, version reconciliation, bounded polling, QR and code parsing, authorization binding, scan lock, history paging, basket rules; `/finance`: read-only API with bounded retries, daily report store, cursor-chain export, CSV | n/a                                              |
| `packages/shared`      | DE/EN catalogues, euro-cent and Europe/Berlin formatting, Berlin calendar-day ranges across clock changes, design tokens + Tailwind preset, React i18n bindings                                                                                                                                                                 | n/a                                              |

## Prerequisites

Verified on this setup (see [docs/progress.md](docs/progress.md) for exact results):

| Tool          | Version used                          | Notes                                                                                                                                                                        |
| ------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS / CPU   | 26.5.1, Apple M2 (arm64), 16 GB       |                                                                                                                                                                              |
| Node.js       | 24.22.2 (LTS), pinned                 | pnpm downloads it on install (`useNodeVersion` in `pnpm-workspace.yaml`) and runs every `pnpm` script with it; `.nvmrc` names the same version. Check with `pnpm toolchain`. |
| pnpm          | 10.34.9 via Corepack                  | Pinned in `package.json#packageManager`. pnpm itself runs on whatever `node` is on PATH (here Homebrew's 23.11).                                                             |
| Xcode         | 26.1.1                                | This is why Expo SDK 54 is used: SDK 55 needs Xcode 26.2+, SDK 56–58 need 26.4+.                                                                                             |
| JDK           | 17 (Zulu 17.0.13)                     | React Native 0.81 needs JDK 17. `pnpm apk:*` passes it to Gradle explicitly, because `~/.gradle/gradle.properties` on this Mac pins JDK 11.                                  |
| Android SDK   | platform 36, emulator 36.3, phone AVD | NDK 27.1 and CMake are downloaded by Gradle on the first native build (license already accepted).                                                                            |
| Google Chrome | 156                                   | Only for the headless browser check.                                                                                                                                         |

## Setup

```sh
corepack enable pnpm   # once per machine: puts the pinned pnpm on PATH (undo: corepack disable pnpm)
pnpm install           # first run also downloads the pinned Node.js 24.22.2 for project scripts
pnpm env:init          # copies each .env.example to .env (never overwrites); then set the seeded password (below)
pnpm toolchain         # shows the Node.js and pnpm versions that actually run the scripts
```

Without `corepack enable`, prefix commands with `corepack`, e.g. `corepack pnpm install`. Run project
tools through `pnpm` (scripts, `pnpm exec`, `pnpm node`); calling `./node_modules/.bin/…` directly
uses the system `node` instead of the pinned version.

Then put the mock's published test password into `EXPO_PUBLIC_SEEDED_PASSWORD` (`apps/student/.env`,
`apps/till/.env`) and `VITE_SEEDED_PASSWORD` (`apps/dashboard/.env`). It is public demo data that the
builds inline; `pnpm dashboard:build` stops with a message while it is missing.

### Test logins (public demo accounts of the mock API)

All passwords are the API description's published `test1234`.

| Account                                                                   | Role    | Where                                                        |
| ------------------------------------------------------------------------- | ------- | ------------------------------------------------------------ |
| `student`, `staff`, `guest`                                               | payer   | Student app (each pays a different price for the same order) |
| `cashier-campus-1` … `-3`, `cashier-nord-1`, `-2`, `cashier-bibliothek-1` | cashier | Till                                                         |
| `finance`                                                                 | finance | Dashboard (signs in with one button)                         |

## Run

| Command                               | What                                                                            | Port |
| ------------------------------------- | ------------------------------------------------------------------------------- | ---- |
| `pnpm student`                        | Metro for the student app (press `a` / `i`)                                     | 8081 |
| `pnpm student:android`                | …and open it in Expo Go on a running emulator                                   | 8081 |
| `pnpm student:ios`                    | …and open it in Expo Go on an iOS simulator                                     | 8081 |
| `pnpm till`                           | Metro for the till; serves the till's development build (press `s` for Expo Go) | 8082 |
| `pnpm till:android` / `pnpm till:ios` | …and open it in Expo Go on a running emulator / iOS simulator                   | 8082 |
| `pnpm dashboard`                      | Vite dev server                                                                 | 5173 |
| `pnpm dashboard:build`                | Production build to `apps/dashboard/dist`                                       | n/a  |
| `pnpm dashboard:preview`              | Serve the production build                                                      | 4173 |
| `pnpm dashboard:browser-check`        | Drive the served build in headless Chrome against the live API (read-only)      | n/a  |

Both Metro servers can run at the same time, and the apps have distinct native IDs
(`dev.omerarslan.mensa.student`, `dev.omerarslan.mensa.till`), so their builds install side by side.

**Physical devices** (the setup verified on 2026-11-04; Mac and devices on the same network):

| App     | Device           | Build                                                                                                                        | Metro                                                                                    |
| ------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Student | Android phone    | Release APK, no Metro needed (see _Android standalone APK_)                                                                  | —                                                                                        |
| Student | iPhone (Face ID) | Debug build: `pnpm --filter @mensa/student exec expo run:ios --device` (Face ID needs a native build; Expo Go cannot use it) | `pnpm student` (8081)                                                                    |
| Till    | iPad             | Development build with `expo-dev-client`: `pnpm --filter @mensa/till exec expo run:ios --device --port 8082`                 | `pnpm till` (8082), then open Mensa Till; it connects through the `mensa-till://` scheme |

The till also still runs in the App Store's Expo Go, which supports SDK 54: start `pnpm till` and
press `s`, or use `pnpm till:ios` / `pnpm till:android` on a simulator or emulator. Both Metro servers
run side by side, so the iPhone and the iPad can be used together.

iOS signing stays local: the Apple team chosen for `expo run:ios --device` is kept in the git-ignored
`apps/*/ios` projects. If Expo CLI ever writes `ios.appleTeamId` into an `app.json` (it does after a
clean iOS prebuild), do not commit that line.

## Checks

```sh
pnpm check            # Prettier, ESLint (type-aware), typecheck (6 workspaces), tests, single-instance check, native copy check, dashboard build
pnpm bundle:native    # Metro + Hermes bundles for iOS and Android, both apps (no native compile)
pnpm api:spec-diff    # opt-in, network: live OpenAPI vs committed copy (read-only)
ZAHLN_SMOKE_PASSWORD=<seeded password> pnpm api:smoke         # opt-in, network: see below
ZAHLN_SMOKE_PASSWORD=<seeded password> pnpm api:order-probe   # opt-in, network, WRITES one cashier order
ZAHLN_SMOKE_PASSWORD=<seeded password> pnpm api:payment-probe # opt-in, network, WRITES one order + one payment
pnpm dashboard:browser-check [-- --url <URL>] [--idle]          # opt-in, network, read-only: dashboard in headless Chrome (local: run pnpm dashboard:preview first)
```

`pnpm api:smoke` sends only `GET /config`, `POST /sessions` (one seeded account), `GET /mensas` (with
and without a token) and CORS preflights. It never creates orders, payments or refunds, keeps the
token in memory and prints no token, password or user data. The seeded password is the published
test password (see _Test logins_); the `.env.example` files leave it empty, so each build includes it
deliberately.

`pnpm api:order-probe` creates **one live order** as the seeded cashier `cashier-campus-1`, through the
real intent path, and prints the QR payload with the order ID replaced by `<orderId>`. Its intent is
saved in `.local/order-probe-intents.json` (git-ignored) before the request is sent, so running it
again reuses the same key and only reads. It never pays or refunds. `pnpm api:payment-probe` adds one
payment by the seeded student and records the payment's status and version as it settles; it resumes
on a rerun and starts nothing new without `--new-order` / `--new-payment`. Live writes are listed in
[docs/api-notes.md](docs/api-notes.md#live-writes-ledger).

`pnpm dashboard:browser-check` signs in as `finance` in a fresh Chrome profile and compares the page
with the API's own answers: report rows and figures, the attention list, four filter combinations,
paging, the payment detail, a filtered and a complete CSV export (against an independent traversal),
cancellation, German, phone width, reload and sign-out, plus CORS (no blocked request, preflights
allowing `Authorization` and `X-Candidate-Id`). `--idle` waits 6.5 minutes to see the session renew.
It defaults to the preview server and works against a deployed URL as well.

## Dashboard deployment

**Live:** https://zahln-mensa-dashboard-4ft.pages.dev/ (Cloudflare Pages project `zahln-mensa-dashboard`, production branch
`main`, deployed 2026-11-02 by direct upload of a local build; this upload is also at
https://9b7d6d23.zahln-mensa-dashboard-4ft.pages.dev). The served `index.html`, JavaScript and CSS
are byte-identical to a build of `7c08d2f`; the dashboard's code has not changed since `0f503cf`.

Checked on the deployed URL (2026-11-02):

- **Automated, passed:** `pnpm dashboard:browser-check -- --url https://zahln-mensa-dashboard-4ft.pages.dev/`, 36/36, run by the
  owner and once more independently: sign-in, reports equal to the API, attention list, filters,
  paging, payment detail, a filtered and a complete CSV export (5,582 payments), cancellation, German,
  phone width, deep-link reload, sign-out, and CORS from this origin (no request blocked). Plain HTTP
  redirects to HTTPS.
- **Manual:** the owner signed in with the finance demo account and opened Daily totals, Needs
  attention and Payments.
- **Not run on the deployed URL:** the 6.5-minute idle-session check (`--idle`, passed locally only)
  and the manual checks D1–D4 in [docs/manual-tests.md](docs/manual-tests.md).

| What                                        | Value                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Build command                               | `pnpm install && pnpm dashboard:build`                                                                                           |
| Output directory                            | `apps/dashboard/dist`                                                                                                            |
| Environment (public, inlined at build time) | `VITE_API_BASE_URL=https://dev.zahln.de`, `VITE_CANDIDATE_ID=c_5b3ceacafb`, `VITE_SEEDED_PASSWORD=<the published test password>` |
| SPA rewrites                                | None needed: routes live after `#`, so deep links and reloads work on any static host                                            |
| CORS                                        | The API answers `Access-Control-Allow-Origin: *` and allows the requested headers; no proxy needed                               |

To redeploy after a change (the project exists; `wrangler login` is needed once per machine):

```sh
pnpm dashboard:build
pnpm dlx wrangler@4.151.1 pages deploy apps/dashboard/dist --project-name zahln-mensa-dashboard --branch main
pnpm dashboard:browser-check -- --url https://zahln-mensa-dashboard-4ft.pages.dev/
```

## Android standalone APK

```sh
pnpm apk:student                         # armeabi-v7a + arm64-v8a: the review build for any phone
ANDROID_ABIS=arm64-v8a pnpm apk:student  # faster: emulator and 64-bit phones (Pixel XL included)
pnpm apk:till                            # the same for the till
adb -s <serial> install -r artifacts/android/<file>.apk
```

The script runs `expo prebuild --clean` (regenerating the git-ignored `android/` folder from
`app.json`) and `gradlew assembleRelease` with JDK 17. The JavaScript is compiled to Hermes bytecode
inside the APK, so it runs without Metro. File names carry the version, the Android build code, the
ABIs and the source commit, with `-dirty` for a build from uncommitted changes, for example
`mensa-student-1.0.0-4-armeabi-v7a+arm64-v8a-deedd3e.apk`. Current builds, checksums and their
verification: [docs/progress.md](docs/progress.md). All are signed with the React Native template
**debug key** (installable and updatable over earlier builds from this repository, but not a Play Store
build). EAS Build is the alternative route; it needs an Expo account and was not used.

**Development client and release builds:** `expo-dev-client` is a till dependency for the iPad
development build only. It is kept out of release builds on purpose: on Android its native modules
are excluded from autolinking (`expo.autolinking.android.exclude` in `apps/till/package.json`; with
them, a release APK grew from 28.2 to 41.9 MB and gained ML Kit, Google Play services and Compose
tooling components and the `ACCESS_NETWORK_STATE` permission); on iOS, Expo links its modules in
Debug only; no extra `exp+` URL scheme is generated (`addGeneratedScheme: false`); and pnpm does not
hoist it (`pnpm-workspace.yaml`), so the student app, which has no development client, does not
pick up its config plugin. Checked 2026-11-04: release APKs built with this setup have the same
manifest, permissions and JavaScript bundle as build 3.

**App version:** `expo.version` in each `apps/*/app.json` (now `1.0.0`, equal to the server's
`minAppVersion`). Builds turn it into Android's versionName and iOS's CFBundleShortVersionString; at
runtime `appVersion` in `apps/*/src/api.ts` reads it and the transport sends it as `X-App-Version`.

## Configuration and what is public

| File                                  | Variables                                                                             | Visibility                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/student/.env`, `apps/till/.env` | `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_CANDIDATE_ID`, `EXPO_PUBLIC_SEEDED_PASSWORD` | **Public**: inlined into the app bundle (verified in the Hermes bytecode) |
| `apps/dashboard/.env`                 | `VITE_API_BASE_URL`, `VITE_CANDIDATE_ID`, `VITE_SEEDED_PASSWORD`                      | **Public**: inlined into the web bundle                                   |
| `.env` (root)                         | `ZAHLN_*` for the smoke check                                                         | Local scripts only, never bundled                                         |

The candidate ID is a data namespace sent on every request, not a credential. Client builds cannot
keep secrets, so no secret or token belongs in any of these files. The one password,
`EXPO_PUBLIC_SEEDED_PASSWORD` / `VITE_SEEDED_PASSWORD`, is the mock's published test password: the
apps and the dashboard need it to sign the seeded accounts in (mock-specific; a real app never ships a
password). Bearer tokens are held in
memory only. Saved payment intents (Expo SecureStore on the device) hold IDs, amounts and states, never
a token, password or name. `.env` files, signing material, generated native projects and `.local/` are
git-ignored.

## Repository layout

```
apps/student      Expo app, phone (React Navigation native stack)        entry: index.ts → src/App.tsx
apps/till         Expo app, tablet-first                                 entry: index.ts → src/App.tsx
apps/dashboard    React + Vite web app                                   entry: src/main.tsx → src/App.tsx
packages/api      contract copy, types, transport, client + validation   src/transport.ts, src/client.ts
packages/domain   payment rules: intents, sessions, clock, gate, polling  src/intent-controller.ts
packages/shared   i18n, formatting, design tokens, Tailwind preset        src/index.ts, tailwind-preset.cjs
scripts/          env-init, standalone APK build, single-instance check, dashboard browser check
docs/             design, architecture, API notes, progress record, manual tests, review guide
```

More: [docs/design.md](docs/design.md) · [docs/design-system.md](docs/design-system.md) · [docs/architecture.md](docs/architecture.md) · [docs/api-notes.md](docs/api-notes.md) ·
[docs/review-guide.md](docs/review-guide.md)

## Technology choices

| Choice                                                  | Why                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expo SDK 54, React Native 0.81.5, React 19.1.0          | Newest stable SDK this Mac's Xcode 26.1.1 can build for iOS; still patched (54.0.38). Upgrading to SDK 58 needs Xcode 26.4+ (Node 24 is already in place).               |
| pnpm 10 workspaces, isolated layout                     | Stops packages from using undeclared dependencies. Expo supports isolated installs from SDK 54. No Turborepo/Nx: not needed at this size.                                |
| NativeWind 4.2.7 + Tailwind 3.4.19 everywhere           | NativeWind's stable line requires Tailwind 3; using Tailwind 3 on the web too lets one preset carry the design tokens to all three apps.                                 |
| Vite 8 + React 19.1.0 for the dashboard                 | React pinned to the Expo version, so one React instance exists in the workspace.                                                                                         |
| openapi-typescript 7                                    | Types generated from the contract; the transport (~200 lines) and the runtime decoders are hand-written to keep retry and validation semantics explicit.                 |
| TypeScript 5.9, ESLint 9 (flat, type-aware), Prettier 3 | TypeScript 7 is not supported by typescript-eslint yet. ESLint 9 is deprecated upstream; ESLint 10 runs on the pinned Node 24 but is deferred to its own change.         |
| `node:test` via tsx                                     | Platform-neutral logic is tested without a Jest/Babel setup.                                                                                                             |
| expo-camera 17, expo-local-authentication 17            | SDK 54's own camera (with barcode scanning) and biometric/device-PIN prompt; both work in Expo Go on Android, and permissions are set in `app.json`.                     |
| expo-network 8 (student only)                           | SDK 54's own network-state listener, a hint to re-check payment availability when the connection returns; its unused `ACCESS_WIFI_STATE` is blocked.                     |
| @expo/vector-icons 15 (Ionicons)                        | One icon family for both platforms, already part of Expo SDK 54 (no native code; the font loads through `expo-font`). Every icon is decorative and has words next to it. |
| Hash routes, no router or UI library in the dashboard   | Five screens; deep links survive any static host; small domain stores read through `useSyncExternalStore`.                                                               |
| qrcode 1.5.4                                            | Mature QR encoder; the till draws its matrix with plain Views. react-native-qrcode-svg had eight releases in four days, and react-native-svg duplicated NativeWind.      |

## Known blockers and limitations

- **BUG-01 (fixed in Phase 1, verified on the Pixel XL):** build 3 showed an offline
  payment-availability warning twice on the review screen, kept a stale one next to "Pay" after a
  return to the foreground, and did not re-check availability while it stayed in front. Build 4
  re-checks by itself when the connection returns (and a few times after a failed check), shows one
  live warning with "Check availability again", and never keeps a copy. Verified with deterministic
  tests, on an Android emulator and by N9 on the Pixel XL (passed 2026-11-04). Install build 4 over
  build 3 without losing data:
  `adb -s <serial> install -r artifacts/android/mensa-student-1.0.0-4-armeabi-v7a+arm64-v8a-deedd3e.apk`.
  The iPhone development build needs `expo run:ios --device` again to pick up `expo-network`; until
  then it re-checks on the timer, in the foreground and on request only. Details:
  [docs/progress.md](docs/progress.md).
- **Device testing is partly done** (2026-11-04): the core payment, refund, offline and session flows
  passed on a Pixel XL, an iPad A16 and an iPhone 17 Pro. Not run on devices: TalkBack, VoiceOver,
  maximum font sizes, a force-stop with a genuinely unresolved payment, a real lost response
  (covered by simulated-server tests only), and direct ID-based access to another till's payment.
- **Local authorization is a device-side gate.** The mock API cannot verify a fingerprint or PIN; only
  the bearer token authorizes a payment.
- **No lookup by idempotency key.** A payment, order or refund whose response was lost can only be
  settled by resending it with the same key within 24 hours. After that an unknown payment stays
  unknown, and an unknown refund keeps blocking another refund on that payment, on purpose.
- **Reports and exports have no version or snapshot.** "Last fetched" is when a copy arrived; an
  export reads every page of one cursor chain, so a payment that changes during the export appears
  in its newest seen state. It is not an atomic accounting extract.
- **Mock sessions**: the apps and the dashboard keep the published test password in memory to sign
  in again when the 5-minute token ends (no refresh token); expired tokens answer `401 unauthorized`
  after about a minute, handled like `session_expired`. The dashboard keeps nothing in storage, so a
  reload asks to sign in again.
- **Debug-signed APKs**: installable and updatable over earlier builds from this repository, not
  store builds.
- Changing the display size makes Android recreate the app's screen; the app returns to sign-in,
  and saved intents come back after signing in. Font size and language changes should do the same
  (not tested).
- No Android tablet: the till's two-column layout was checked on the phone emulator at a tablet-like
  width.
- Plain `./gradlew`, Android Studio and `expo run:android` still get the JDK 11 pin from
  `~/.gradle/gradle.properties`; only `pnpm apk:*` overrides it.

## Manual steps on this Mac

See [docs/progress.md](docs/progress.md#manual-steps) for the current, precise list.

## AI tools

- **ChatGPT (OpenAI)**: task analysis, prompt preparation and read-only source review.
- **Claude Code (Anthropic)** in VS Code, model Claude Opus 5.5: implementation (code, tests,
  scripts and documentation) and the executed verification recorded in `docs/progress.md`, in
  stages 1 to 4.

Update this section as later stages use AI tools.
