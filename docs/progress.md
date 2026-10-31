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

## Stage 2: payment rules, intents, sessions and reconciliation (2026-10-31)

Goal: the rules that keep money from moving twice and keep screens truthful, as tested domain code,
wired into both native apps, before any payment screen exists. The architecture is described in
[architecture.md](architecture.md); live observations in [api-notes.md](api-notes.md).

### What was built

- **`@mensa/api`**: typed client for all ten operations; runtime decoders for config, sessions,
  mensas, orders, payments, payment details, payment pages, refunds and daily totals; mandatory
  branded idempotency keys on writes; strict timestamp and HTTP-date parsing; server `Date` samples
  reported to a callback.
- **`@mensa/domain`**: intents (`intent.ts`) and their controller (`intent-controller.ts`), the
  storage contract (`intent-store.ts`), write classification (`write-outcome.ts`), the session
  coordinator (`session.ts`), the server clock (`server-clock.ts`), the payment gate
  (`payment-gate.ts`, `app-version.ts`), the resource cache and order-version rule
  (`resource-cache.ts`, `versioning.ts`), bounded polling (`poller.ts`) and the QR parser (`qr.ts`).
- **Apps**: an Expo SecureStore `IntentStore` and `expo-crypto` keys in both apps, a
  `PaymentServicesProvider` (gate, session coordinator, store, one controller per signed-in user,
  foreground handling), the gate state on the student home screen, and a secure-storage self-check in
  both apps. There is still no sign-in, scan, pay, history, order or refund screen.
- **Live probe**: `pnpm api:order-probe` creates one cashier order through the real intent path to
  observe the QR format (`.local/` holds its saved intent; git-ignored).

### Verification

Kinds as in stage 1, plus **tests** (deterministic, against a simulated server), **mutation**
(a deliberate bug must make a test fail) and **live** (requests to `dev.zahln.de`).

| Check                                                                 | Kind         | Result                    | Evidence / notes                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (Prettier, ESLint, typecheck ×6, tests, dashboard build) | source/build | passed                    | Final run 2026-10-31 on Node 24.22.2. Dashboard bundle 205 kB JS (66 kB gzip).                                                                                                                                                            |
| Unit and orchestration tests                                          | tests        | passed (80/80, 22 suites) | Real transport, validation, controller and session code against `testing/fake-server.ts` at the `fetch` level. They prove client behaviour under **simulated** server effects, not the real server's behaviour.                           |
| Mutation checks (20 single-point bugs)                                | mutation     | 19 killed, 1 survived     | See the list below.                                                                                                                                                                                                                       |
| `pnpm bundle:native` (iOS + Android, both apps)                       | bundle       | passed                    | Hermes bytecode. The simulated server, harness, in-memory store, file store and test credentials appear in none of the four bundles (string scan).                                                                                        |
| `expo install --check` (student, till)                                | source       | passed                    | `expo-secure-store` 15.0.8 and `expo-crypto` 15.0.9 match SDK 54.                                                                                                                                                                         |
| `expo-doctor` 1.21.5 (student, till)                                  | source       | passed (18/18 each)       |                                                                                                                                                                                                                                           |
| Student APK 1.0.0 (`ANDROID_ABIS=arm64-v8a`)                          | build        | passed                    | `artifacts/android/mensa-student-1.0.0-arm64-v8a.apk`, 28.1 MB, versionName 1.0.0, versionCode 1, minSdk 24, targetSdk 36, debug-keystore signed. The merged manifest has SecureStore's backup and data-extraction exclusion rules.       |
| APK on the Android 16 emulator (arm64), Metro stopped                 | runtime      | passed                    | Fresh install, launch, no JS errors in logcat. Home shows "Payments are available." (`GET /config` from the release build). Secure-storage check: "273 bytes saved, read back and deleted", in English and German. Button 126 px = 48 dp. |
| Till in Expo Go 54 on the same emulator                               | runtime      | passed                    | Renders without a gate card; secure-storage check passed (273 bytes). Expo Go's SecureStore module, not a till build.                                                                                                                     |
| Order probe (`pnpm api:order-probe`)                                  | live         | passed, with one bug      | Two cashier orders were created where one was intended; see problem 1. No payments or refunds sent. Both orders read back later as `expired`, version 1, unpaid.                                                                          |
| Read-only live checks                                                 | live         | passed                    | QR envelope of both orders; `payer.id` = session `user.id` for all 69 payments of the three seeded payers; order expiry keeps the version (both orders).                                                                                  |
| Dual-ABI APK, till APK                                                | build        | not run                   | One APK was enough to prove the new native modules; disk is tight.                                                                                                                                                                        |
| iOS simulator or device for stage 2                                   | runtime      | not run                   | The adapter was exercised on Android only.                                                                                                                                                                                                |
| Physical Android or iOS device                                        | runtime      | not run                   | `adb devices` listed no phone (only the emulator). No physical test is claimed.                                                                                                                                                           |
| TalkBack / VoiceOver announcements                                    | runtime      | not run                   | Live regions and the iOS announcement are in the code; no screen reader was run.                                                                                                                                                          |
| OS process-kill recovery                                              | runtime      | not run                   | No screen creates an intent yet. The restart tests simulate a restart inside one JavaScript process (new controller, same store object); that is not an OS process kill.                                                                  |
| Live payments, refunds, 426, 503, session expiry                      | live         | not run                   | Payment and refund writes are only simulated in this stage. Live config stayed `minAppVersion=1.0.0`, `paymentsEnabled=true`, so the app showed only the open gate.                                                                       |

**Mutation checks** (each applied alone, full suite run, file restored; script kept outside the repo):
killed: a refusal on a retry settling an earlier ambiguous attempt; ignoring the replay window;
sending although saving failed; accepting a lower payment version; a cache without the version rule;
using a late first response after an account switch (first survived; the test "discards a first
response that arrives after an account switch" was added); using a late repeated response after a
switch; one re-login per expiry instead of a shared one; not checking the re-login's user; showing
`pending` as confirmed; accepting a prefix-search hit for another order; fractional server time
(3 tests fail); ignoring unreadable records; reading gateway errors as final refusals; skipping the
refund capacity check; ignoring the payment gate; rejecting an order's equal-version expiry in the
cache, or in the intent; a second refund while the first is unresolved.
**Survived:** removing the payer check from payment recovery. A payer's `GET /orders` and
`GET /payments` only ever show that payer's payments (the simulated server enforces it, and the live
check above confirmed it for 69 payments), so no test can reach the check; it stays as defence in
depth.

### Problems found by verification, and fixes

1. **A second live order.** The first probe run saved its intent with a fractional `firstSentAt`
   (`performance.now()` plus an offset). The record failed integer validation on reload, and the
   controller, which then treated an unreadable store as empty, created a new order with a new key.
   Fixes: `ServerClock.now()` returns whole milliseconds (earliest floored, latest ceiled); the
   controller refuses every new action while any record of the user is unreadable; the test harness
   uses a fractional monotonic clock, so the bug makes three tests fail. The next live run with the
   unreadable records was refused, as intended. The two local records were then repaired by hand
   (`firstSentAt` floored) and the following run only read.
2. **Order expiry keeps the version** (live, contradicting the contract). The cache would have kept
   showing `open`. Fixed with `isLaterOrderState`; the simulated server now expires orders the same
   way, and two tests cover the cache, the intent and the till's polling.
3. **The in-memory test store shipped in the app bundles** (exported from the package index; Metro does
   not tree-shake). Moved to `src/testing/` and no longer exported.
4. **The gate would have told the till something untrue**: the API checks the payer app's version,
   never the till's. The till no longer shows the gate.
5. **An unreadable store could leave a half-loaded controller polling** and an unhandled rejection.
   The provider now disposes it and exposes `recordsUnavailable`.
6. **The generated `Problem` type requires `detail`**, which the API may omit. `toProblem` fills
   `null`, replacing an unsound type guard.
7. **The foundation notice was no longer true** ("only proves the project setup"); reworded in both
   languages, and the APK rebuilt.
8. Lint: a now-unnecessary type assertion (TypeScript infers the `every` predicate); a doc comment
   that named a renamed function.

APK build times on this machine: 2 min 17 s (first build with the new modules), then 54 s and 61 s.
Disk: 7.0 GB free before the builds, 3.0 GB after three builds, Expo Go and the emulator, 4.2 GB
after removing about 1.5 GB of regenerated Gradle/CMake output (the generated `android/` project and
its `debug.keystore` were kept).

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
4. **Review APK**: `pnpm apk:student` (both ABIs) writes
   `artifacts/android/mensa-student-1.0.0-armeabi-v7a+arm64-v8a.apk`. Only the arm64 build exists so
   far. `artifacts/android/mensa-student-0.1.0-arm64-v8a.apk` is obsolete (below `minAppVersion`).
5. **Order probe**: `ZAHLN_SMOKE_PASSWORD=<seeded password> pnpm api:order-probe`. It reuses its saved
   intent in `.local/order-probe-intents.json`, so a re-run only reads. Deleting that file makes the
   next run create a new live order.
6. **Android tablet emulator**: install Android Studio → Device Manager → create a tablet device
   (e.g. Pixel Tablet) with the already installed API 36.1 arm64 Google Play image.
7. **iPhone 17 Pro**: Xcode → Settings → Accounts → add your Apple ID (a free personal team works;
   profiles last 7 days). On the phone, enable Developer Mode (Settings → Privacy & Security). Then
   `cd apps/student && pnpm exec expo run:ios --device` (generates `ios/`, runs CocoaPods, needs
   several GB). If the bundle ID is taken for your team, change `ios.bundleIdentifier` in `app.json`.
8. **Android phone (if borrowed)**: enable USB debugging, then `adb install -r` the APK.
9. **Disk**: 4.2 GB free. The phone emulator's data (`~/.android/avd/Medium_Phone.avd`, 5.4 GB) is
   the largest reclaimable item (Device Manager → Wipe Data); Expo's caches in `~/.expo` hold 1.2 GB.
   Both are outside the project and were not touched.
10. **Accounts**: the private GitHub repository exists (`omerarslnn/zahln-take-home`); invite the
    reviewers when ready. A dashboard host (e.g. Vercel, Netlify or Cloudflare Pages) and, optionally,
    an Expo account for EAS are not set up.

## Recommended scope for stage 3: the payment interface

1. **Student**: seeded-account picker (sign-in through `SessionCoordinator`); QR scan
   (`expo-camera`) → `parseOrderQr` → `GET /orders/{id}`; confirmation with the server's amount and
   local biometric or PIN authorization before `payOrder`; a result screen driven by `paymentDisplay`
   and polling; history including payments still being checked; payment detail.
2. **Till**: cashier sign-in; menu from `GET /mensas`; order entry → `createOrder` → QR display;
   following the order to paid or expired; full and partial refunds with the server's refundable
   amount and clear refusal messages.
3. **Recovery UI**: unresolved intents with "checking" states, a retry action inside the replay
   window, and a deliberate way for a cashier to close an unresolvable refund intent after checking
   the payment's history (today it blocks further refunds on that payment indefinitely).
4. **First real payment**: confirm whether settlement grows the payment's `version` (api-notes,
   observation 7) before relying on polling to show `confirmed`.
5. A screen-reader pass of the pay flow (TalkBack and VoiceOver), the dual-ABI review APK, the till
   APK, and an iOS development build.

The dashboard (totals, attention queue, search, CSV export, deployment) follows after that.
