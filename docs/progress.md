# Progress record

## Stage 1: foundation (2026-10-29 to 2026-10-30)

Goal: runnable shells for all three surfaces, shared packages with enforced boundaries, a tested
transport, honest API observations, and an early Android build path. No payment behaviour.

The results below were recorded on system Node 23.11 with app version 0.1.0. The environment was
updated afterwards; see [Environment fixes before stage 2](#environment-fixes-before-stage-2-2026-10-30).

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

## Environment fixes before stage 2 (2026-10-30)

### Changes

- **Node 24 LTS for the project**: `useNodeVersion: 24.22.2` in `pnpm-workspace.yaml` makes pnpm
  download that exact Node.js and run every `pnpm` script, `pnpm exec` and `pnpm node` with it, and
  put it first on PATH for tools those scripts start. No Node version manager (nvm, fnm, Volta, asdf,
  mise, nodenv) is installed on this Mac, so pnpm's own mechanism is used instead of a global
  switch. `.nvmrc` names the same version for anyone who uses one; `engines.node` is `^24.11.0`,
  the Node 24 LTS line. `pnpm toolchain` prints what actually runs.
- **pnpm**: still pinned at 10.34.9 (`packageManager`). No dependency versions changed: nothing
  failed on Node 24.
- **App versions**: student and till `0.1.0` → `1.0.0` (`expo.version` in `app.json`, mirrored in
  `package.json`), matching the server's `minAppVersion`. `appVersion` in `apps/*/src/api.ts` is the
  runtime source sent as `X-App-Version`. Payment gates (forced update, payments paused) are not
  implemented.
- **JDK**: unchanged and verified. The global `~/.gradle/gradle.properties` pin to Temurin 11 stays;
  `pnpm apk:*` keeps passing JDK 17 to Gradle.
- **Disk**: generated build output removed (see below). Source, the generated Android project files
  and its `debug.keystore` were kept; global caches, SDKs and other projects were not touched.
- **Docs**: setup and versions corrected. The contract has 28 component schemas, counted from the
  file; an earlier handoff message said 27.

### Verification

| Check                                                    | Kind         | Result            | Evidence / notes                                                                                                                                                 |
| -------------------------------------------------------- | ------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` with the pinned runtime                   | setup        | passed            | pnpm fetched Node 24.22.2 (199 MB in `~/Library/pnpm/nodejs`). `engines` `^24.11.0` was accepted although pnpm itself runs on Node 23.11.                        |
| `pnpm toolchain`                                         | setup        | passed            | Scripts and the tools they start: v24.22.2. pnpm 10.34.9 itself: system Node v23.11.0.                                                                           |
| `pnpm node`, `pnpm exec`, `pnpm --filter … exec`         | setup        | passed            | All v24.22.2. `pnpm dlx` and direct `./node_modules/.bin/…` calls use the system Node (23.11).                                                                   |
| `pnpm check`                                             | source/build | passed            | On Node 24.22.2: Prettier, ESLint, typecheck ×6, 26/26 tests, dashboard build.                                                                                   |
| `pnpm bundle:native`                                     | bundle       | passed            | On Node 24.22.2: iOS and Android Hermes bundles for both apps.                                                                                                   |
| `expo install --check` (both apps)                       | source       | passed            | Dependencies match SDK 54.                                                                                                                                       |
| `expo-doctor` 1.21.5 (both apps)                         | source       | passed (18/18)    | On Node 24.22.2 via `pnpm exec npx`. Via `pnpm dlx` it also passes but runs on Node 23.11 and warns about its own engine.                                        |
| Resolved Expo config (`expo config --type public`)       | source       | passed            | Both apps: `version` 1.0.0, IDs unchanged, `versionCode`/`buildNumber` default 1, SDK 54.                                                                        |
| Gradle daemon JDK (`gradlew --version`)                  | build config | passed            | Without override: Temurin 11 (from `~/.gradle/gradle.properties`). With the APK script's `-Dorg.gradle.java.home`: Zulu 17.0.13.                                 |
| Gradle-time autolinking on Node 24                       | build step   | passed            | `expo-modules-autolinking`: 8 Expo modules and 5 React Native native modules resolved for Android.                                                               |
| Student APK at version 1.0.0                             | build        | not run           | Not rebuilt: no unresolved native concern. `apps/student/android/app/build.gradle` still says `versionName "0.1.0"`; the next `pnpm apk:student` regenerates it. |
| Physical devices, camera/QR, biometrics, PIN, tablet AVD | runtime      | not run / blocked | Unchanged: untested.                                                                                                                                             |

The next APK is signed with the same template debug key (SHA-1 `5E:8F:16:…:F6:25`, React Native's
published debug keystore), so it can be installed over the 0.1.0 build with `adb install -r`.

**Disk** (free on the home volume): 6.89 GiB before; 8.20 GiB after removing about 1.6 GB of generated
build output (610 MB of Gradle/CMake output in `apps/student/android`, 986 MB in 11 `android/build`
and `android/.cxx` folders inside installed packages); 8.01 GiB after verification, which added the
pinned Node download and regenerated bundles. The next APK build recreates most of the removed output.

## Manual steps

1. **pnpm on PATH**: `corepack enable pnpm` (undo: `corepack disable pnpm`), or prefix commands with
   `corepack`.
2. **System Node (optional)**: project scripts already run on Node 24.22.2. pnpm itself, `pnpm dlx`
   and direct binary calls still use Homebrew's Node 23.11, which is end-of-life. To change that,
   install Node 24 system-wide (for example `brew install node@24`, then put it first on PATH in
   your shell profile) or a version manager that reads `.nvmrc`. This is a global change, so it is your
   call.
3. **Gradle JDK pin**: `~/.gradle/gradle.properties` line 1 pins
   `org.gradle.java.home=/Library/Java/JavaVirtualMachines/temurin-11.jdk/Contents/Home`. `pnpm apk:*`
   overrides it; plain `./gradlew`, Android Studio and `expo run:android` still get JDK 11. Change or
   remove the line only if no other project needs it.
4. **APK 1.0.0**: `pnpm apk:student` (both ABIs for the review build) regenerates `android/` and
   writes `artifacts/android/mensa-student-1.0.0-armeabi-v7a+arm64-v8a.apk`. It takes a long time
   and needs about 1.6 GB of build space.
5. **Android tablet emulator**: install Android Studio → Device Manager → create a tablet device
   (e.g. Pixel Tablet) with the already installed API 36.1 arm64 Google Play image.
6. **iPhone 17 Pro**: Xcode → Settings → Accounts → add your Apple ID (a free personal team works;
   profiles last 7 days). On the phone, enable Developer Mode (Settings → Privacy & Security). Then
   `cd apps/student && pnpm exec expo run:ios --device` (generates `ios/`, runs CocoaPods, needs
   several GB). If the bundle ID is taken for your team, change `ios.bundleIdentifier` in `app.json`.
7. **Android phone (if borrowed)**: enable USB debugging, then `adb install -r` the rebuilt APK.
8. **Disk**: about 8 GB free. Old simulator runtimes and old Gradle versions under `~/.gradle` are
   candidates to review before any iOS native build or Xcode update.
9. **Accounts**: the private GitHub repository exists (`omerarslnn/zahln-take-home`); invite the
   reviewers when ready. A dashboard host (e.g. Vercel, Netlify or Cloudflare Pages) and, optionally,
   an Expo account for EAS are not set up.

## Recommended scope for stage 2: payment foundations

1. Handle `GET /config` at start: forced update when `appVersion` is below `minAppVersion`, and
   "payments paused" when `paymentsEnabled` is false.
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
