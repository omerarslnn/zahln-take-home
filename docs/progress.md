# Progress record

## Stage 1: foundation (2026-10-29 to 2026-10-30)

Goal: runnable shells for all three surfaces, shared packages with enforced boundaries, a tested
transport, honest API observations, and an early Android build path. No payment behaviour.

### Verification

Kinds: **source** (static checks), **bundle** (JS compiled, nothing installed), **build** (native
artifact), **runtime** (actually running on a simulator, emulator or browser).

| Check                                                                 | Kind         | Result                    | Evidence / notes                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install` (pnpm 10.34.9, isolated layout)                        | setup        | passed                    | No peer warnings. Upstream deprecation notices: `eslint@9.39.5`, and `glob@7`/`inflight`/`rimraf@3` deep in the tree.                                                                                                                                              |
| `pnpm api:generate`                                                   | source       | passed                    | openapi-typescript 7.13.0 → `src/generated/openapi.ts`                                                                                                                                                                                                             |
| `pnpm check` (Prettier, ESLint, typecheck ×6, tests, dashboard build) | source/build | passed                    | Final run 2026-10-30. 26/26 tests. Dashboard bundle 197 kB JS (63 kB gzip).                                                                                                                                                                                        |
| `expo install --check` (student, till)                                | source       | passed                    | Native module versions match SDK 54.                                                                                                                                                                                                                               |
| `expo-doctor` 1.21.5                                                  | source       | passed (18/18, both apps) | Before `git init`, the student app showed 17/18 ("native folders present but app config not synced") because the generated `android/` folder existed and doctor could not see that Git ignores it. The build script always regenerates it with `prebuild --clean`. |
| `pnpm bundle:native` (iOS + Android, both apps)                       | bundle       | passed                    | Hermes bytecode; final run 2026-10-30.                                                                                                                                                                                                                             |
| `pnpm api:spec-diff`                                                  | live         | passed                    | Live spec semantically identical to the committed copy.                                                                                                                                                                                                            |
| `pnpm api:smoke`                                                      | live         | passed                    | See [api-notes.md](api-notes.md). No order/payment/refund requests.                                                                                                                                                                                                |
| Dashboard production build in headless Chrome                         | runtime      | passed                    | Origin `http://localhost:4173`: preflighted `GET /config` 200 and `Date` readable by JS. EN at 1200 px, DE at 500 px (no overflow).                                                                                                                                |
| Student in Expo Go, Android emulator (Android 16, arm64)              | runtime      | passed                    | Native stack navigation, EN→DE switch, RadioButton semantics with checked state, 48 dp targets, `GET /config` 200 on device.                                                                                                                                       |
| Till in Expo Go, Android phone emulator                               | runtime      | passed                    | Stacked phone layout; `GET /config` 200; Metro 8081 and 8082 running at the same time.                                                                                                                                                                             |
| Till with tablet metrics on the Android emulator                      | runtime      | passed                    | `wm size 1600x2560`, `wm density 320` (800 dp): two-column layout. Emulated metrics, not a tablet AVD. Metrics reset afterwards.                                                                                                                                   |
| Student in Expo Go, iPhone 17 Pro simulator (iOS 26.1)                | runtime      | passed (render only)      | Renders; starts in German when the simulator is German (after the `expo-localization` fix). Taps were not automated on iOS.                                                                                                                                        |
| Till in Expo Go, iPad Pro 13-inch (M5) simulator                      | runtime      | passed (render only)      | Two-column tablet layout renders. The simulator hung once under memory pressure and recovered after a restart.                                                                                                                                                     |
| Standalone student APK (`ANDROID_ABIS=arm64-v8a`)                     | build        | passed                    | `artifacts/android/mensa-student-0.1.0-arm64-v8a.apk`, 27.8 MB, debug-keystore signed, versionName 0.1.0, minSdk 24, targetSdk 36.                                                                                                                                 |
| APK install and launch with Metro stopped                             | runtime      | passed                    | `adb install` OK; app renders without Metro or Expo Go; no JS errors in logcat; `GET /config` 200 from the release build.                                                                                                                                          |
| Default dual-ABI APK (`armeabi-v7a` + `arm64-v8a`)                    | build        | not run                   | Same script without `ANDROID_ABIS`; needed for the review build (low-end phones).                                                                                                                                                                                  |
| Till APK (`pnpm apk:till`)                                            | build        | not run                   | Time and disk.                                                                                                                                                                                                                                                     |
| iOS native build / development client                                 | build        | not run                   | Needs Apple signing for a device and 3–5 GB of disk; see manual steps.                                                                                                                                                                                             |
| Physical iPhone / Android phone                                       | runtime      | not run                   | iPhone needs a development build (App Store Expo Go is SDK 58). No Android phone available.                                                                                                                                                                        |
| Android tablet AVD                                                    | runtime      | blocked                   | No Android Studio / `avdmanager` installed.                                                                                                                                                                                                                        |
| Camera / QR, biometrics, PIN                                          | runtime      | not run                   | Not implemented in this stage. A bundle or Expo Go run proves neither camera nor native authentication.                                                                                                                                                            |
| Deployed dashboard, CI                                                | n/a          | not run                   | Later stages.                                                                                                                                                                                                                                                      |

### Problems found by verification, and fixes

1. **Native bundles failed under pnpm isolation**: `react-native-css-interop/jsx-runtime` could not
   be resolved from app code. Both apps now declare `react-native-css-interop@0.2.7`; one instance in
   the store.
2. **Gradle used JDK 11**: `~/.gradle/gradle.properties` sets `org.gradle.java.home` to Temurin 11
   for every Gradle build on this Mac. The APK script now passes JDK 17 with
   `-Dorg.gradle.java.home` for this build only; the global file is unchanged.
3. **Release bundling inside Gradle failed**: `Cannot find module '@babel/plugin-transform-react-jsx'`
   (css-interop's Babel preset names it without declaring it; `expo export:embed` does not find it
   through pnpm's hidden hoist folder). Both apps now declare it (7.29.7, same version as
   `babel-preset-expo`).
4. **Stale "now"**: the formatted current time was computed once per render and went 5 minutes
   stale on screen. Shared `useNow` hook refreshes it every 15 s.
5. **iOS language detection**: `Intl`'s default locale kept the app English on a German iOS
   simulator in Expo Go. `expo-localization`'s `getLocales()` fixed it (verified before/after).
6. **Lint findings**: synchronous `setState` in a dashboard effect (now set in the promise callback
   with a cleanup flag), and `node:test` false positives (scoped `allowForKnownSafeCalls`).

The first APK build attempts took 48 and 18 minutes before failing; the successful one took 87
minutes, with the machine heavily loaded (load average around 90, little free memory). These times
reflect this machine's load and are not representative build times.

### Manual steps

1. **pnpm on PATH**: `corepack enable pnpm` (undo: `corepack disable pnpm`), or prefix commands with
   `corepack`.
2. **Node 24 LTS (recommended)**: Node 23.11 is end-of-life and excluded by ESLint 10, expo-doctor's
   engines and Expo SDK 58. For example, `brew install node@24` and put `/opt/homebrew/opt/node@24/bin`
   first on PATH (a shell-profile edit, your choice), or use a version manager. Then `pnpm install`,
   and upgrade ESLint 9 → 10 in a separate commit.
3. **Gradle JDK pin**: `~/.gradle/gradle.properties` line 1 pins
   `org.gradle.java.home=/Library/Java/JavaVirtualMachines/temurin-11.jdk/Contents/Home`. The APK
   script works around it; plain `./gradlew` or Android Studio builds of this project need JDK 17.
   Change or remove the line if no other project needs JDK 11.
4. **Android tablet emulator**: install Android Studio → Device Manager → create a tablet device
   (e.g. Pixel Tablet) with the already installed API 36.1 arm64 Google Play image.
5. **iPhone 17 Pro**: Xcode → Settings → Accounts → add your Apple ID (a free personal team works;
   profiles last 7 days). On the phone, enable Developer Mode (Settings → Privacy & Security). Then
   `cd apps/student && npx expo run:ios --device` (generates `ios/`, runs CocoaPods, needs several GB).
   If the bundle ID is taken for your team, change `ios.bundleIdentifier` in `app.json`.
6. **Android phone (if borrowed)**: enable USB debugging, then `pnpm apk:student` (both ABIs) and
   `adb install -r artifacts/android/<apk>`.
7. **Disk**: about 6 GB free after the first Android build. `apps/student/android/` (generated) can be
   deleted; old simulator runtimes and old Gradle versions under `~/.gradle` are candidates to review
   before any iOS native build or Xcode update.
8. **Git identity**: the commit uses your global identity (`arslan@fireflow.de`). To use another
   address for this repository only: `git config user.email "<address>"`, then
   `git commit --amend --reset-author --no-edit` (nothing has been pushed).
9. **Later accounts**: private GitHub repository shared with the reviewers; a dashboard host
   (e.g. Vercel, Netlify or Cloudflare Pages); optionally an Expo account for EAS. None started.

### Recommended scope for stage 2: payment foundations

1. Raise both apps to version `1.0.0` (server `minAppVersion`) and handle `GET /config` at start:
   forced update and "payments paused".
2. Observe and record `qrPayload` from one cashier `POST /orders` (the first deliberate write).
3. `@mensa/domain`: payment and refund intent models (draft → submitting → unknown → pending →
   confirmed/declined, refund pending/completed/failed), outcome classification from
   `TransportResult`, a server clock from `Date`, and `newerOf`-based reconciliation with bounded
   polling.
4. Persistence of intents (key + immutable payload) scoped to candidate and user; session manager
   that re-authenticates on `session_expired` without crossing accounts; runtime validation of the
   order/payment fields the logic depends on.
5. Deterministic tests with a fake transport: double tap, lost response after the server saved,
   replay, stale and out-of-order reads, session expiry mid-intent, app restart with a pending intent.

UI flows (scan, confirm, result, till order/QR/refund, dashboard views) belong to stage 3 and later.
