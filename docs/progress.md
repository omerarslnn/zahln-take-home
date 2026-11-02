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

## Stage 3: usable student and till apps (2026-10-31 to 2026-11-01)

### Checkpoint 1: recovery cannot attribute an earlier attempt to a newer one

**Reproduced first.** Attempt A for an order declines; the payer deliberately starts B (new key,
same order, payer and amount); B reaches the server but its response is lost; A's record is removed;
the app restarts with only B on disk. Two new tests then failed on the stage 2 code:

- a stale order read (two versions back, still naming payment A) resolved B as A's **declined**
  payment;
- a payment search that listed A but not yet B did the same.

A third new test, with a hostile response naming another payer, showed that a read of a payment the
intent already knew updated it without checking order, payer and amount (the write path did check).

**Fix.** Reads no longer link any payment to an unknown intent: no resource carries its idempotency
key, so order, payer and amount cannot distinguish attempts (`observePayment` in
`intent-controller.ts`). An intent is settled only by its own response or same-key resend, by reads
of the resource ID that response named (now checked for ID, order, payer and amount), or for
payments by an order read as `paid` without the payer's own payment ID (the contract-backed
"another payer paid it"). The order search and `linkedElsewhere` were removed. Four stage 2 tests
that expected reads to settle a lost payment now expect `checking` until the same-key resend.

**New tests**: the two regressions; the hostile payer on a write and on a read; an unknown payment
kept across an account switch; an unknown refund that no dismissal, deadline, restart or empty
history settles, and that keeps blocking another refund. 84/84 tests pass.

**Mutation run** (23 single-point bugs against this code): all killed, including the stage 2
survivor (removing the payer check), which the hostile fixture now reaches.

### Checkpoint 2: one live payment early (2026-10-31)

`pnpm api:payment-probe` (opt-in, resumes instead of repeating) rang up one order as
`cashier-campus-1` and paid it as `student` through the intent controller: `ord_71832f7697fe562d`,
`pay_650a13b0311ad6fe`, 250 cents. Raw reads (not through the cache): payment `pending v1` → `pending
v1` → `confirmed v2`; order `open v1` → `paying v2` → `paid v3`. So settlement grows the version, and
no equal-version rule for payments was added. Ledger and later observations: [api-notes.md](api-notes.md).

### Checkpoint 3: the apps

What was built (details in [architecture.md](architecture.md), "The apps"):

- **Student**: seeded-account sign-in; home with availability and the user's payment actions; QR scan
  (expo-camera) with a synchronous scan lock and a typed-code alternative; review with the server's
  amount, server-time expiry and every order state; local authorization (expo-local-authentication,
  device PIN fallback) bound to user, order, amount and review; truthful result with read-only check
  and same-key resend; paginated history merged with unresolved actions; payment detail with refunds
  and history; diagnostics.
- **Till**: seeded-cashier sign-in; menu with per-group prices; basket within the contract limits;
  order intent with its QR (drawn with `qrcode`), countdown and server totals per group; the checkout
  stays until `paid` or `expired`, across restarts; paid result with the payer's amount and price
  group; payments list with ID search; detail with full and partial refunds, cents parsing, explicit
  confirmation and one refund action at a time.
- **Domain additions**: `PaymentAuthorizer`, `ScanLock`, `PaymentHistory`/`mergeHistory`, basket
  rules, `parseOrderCode`, `parseEuroAmount`, checkout finality, `canCloseUnshownOrder`, `lastSentAt`,
  `checkAgain`, a change counter for stable React snapshots, `ScopedApi.listMensas`, re-login on
  `401 unauthorized`.

### Verification

| Check                                                                                   | Kind           | Result                      | Evidence / notes                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | -------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (Prettier, ESLint, typecheck ×6, tests, single instances, dashboard build) | source/build   | passed                      | Final run 2026-11-01. Dashboard bundle 238 kB JS (75 kB gzip): the shared message catalogue grew.                                                                                                                                                                                                                                                                                                                                      |
| Unit and orchestration tests                                                            | tests          | passed (101/101, 31 suites) | Simulated server at the `fetch` level; includes the recovery regressions, hostile responses, authorization binding, scan lock, history pages and merge, checkout lifecycle, refunds, cents parsing and expired-session re-login.                                                                                                                                                                                                       |
| Mutation checks (35 single-point bugs)                                                  | mutation       | 35 killed                   | Stage 2's 23 (recovery list updated) plus checkout finality, unshown-order close, authorization account/amount/lock, scan lock, basket limit, history merge and late page, session `unauthorized`, two cents-parsing rules. A suite hang counts as caught (the authorization-lock test was then changed to fail fast).                                                                                                                 |
| `pnpm bundle:native` (iOS + Android, both apps)                                         | bundle         | passed                      | Hermes bytecode, 3.6 MB each.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `expo install --check`, `expo-doctor` 1.21.5                                            | source         | passed (both apps, 18/18)   | expo-camera 17.0.10, expo-local-authentication 17.0.9, react-native-screens 4.16.0 match SDK 54.                                                                                                                                                                                                                                                                                                                                       |
| Release APKs (student `8a8c581`, till `a8bf5aa`)                                        | build          | passed                      | Four APKs (arm64 and two-ABI, both apps); versions, ABIs, SHA-256 and the shared signing certificate in the table below. minSdk 24 (Android 7.0, so Android 10 is covered), targetSdk 36. The till was rebuilt after problem 9; the student app's source has not changed since `8a8c581`.                                                                                                                                              |
| APK permissions                                                                         | build          | checked                     | Student: CAMERA, INTERNET, USE_BIOMETRIC, USE_FINGERPRINT, VIBRATE, ACCESS_NETWORK_STATE (+ an androidx-internal receiver permission). Till: INTERNET, VIBRATE (+ the same). No microphone or storage.                                                                                                                                                                                                                                 |
| Live payment through both apps (Android 16 emulator, release builds, no Metro)          | live + runtime | passed                      | Till created `ord_ebb99f6c6bd7186a`; its on-screen QR decoded (macOS CoreImage) to `zahln://pay?order=ord_ebb99f6c6bd7186a`. Student (staff) typed the code (camera denied), reviewed €5.80, then: no screen lock → "no screen lock" and nothing sent; PIN set → prompt cancelled → "Not paid" and nothing sent; PIN entered → paid. Result "Paid", till "Paid €5.80 at the Staff price". Payment `pay_90d914f2be37a714` confirmed v2. |
| Live refunds (till app)                                                                 | live + runtime | passed                      | "1,234" and "10" refused in the form; partial 1,00 → `ref_c8c9e73384687eb4` completed; "Refund everything left" 4,80 → `ref_4845b3bdc2c7cc3c` completed; then "Nothing is left to refund". Payment v6, refundable 0. The payer's detail shows both refunds and the six history events.                                                                                                                                                 |
| Camera permission on the release build                                                  | runtime        | passed                      | First denial: "Allow camera" offered again; second denial (USER_FIXED): "Camera access is off", "Open settings".                                                                                                                                                                                                                                                                                                                       |
| Price groups for one open order                                                         | live           | passed                      | student 340, staff 580, guest 750 cents (read-only), same as the till's server totals.                                                                                                                                                                                                                                                                                                                                                 |
| Checkout after a process restart (till reinstalled over itself)                         | runtime        | passed                      | The paid order intent came back from SecureStore and, with the `8a8c581` build, loads its order by itself.                                                                                                                                                                                                                                                                                                                             |
| Expired-session behaviour                                                               | live           | discrepancy found           | 401 `session_expired` at 5.2 min, 401 `unauthorized` at 6 min; fixed in `SessionCoordinator` (see problem 5).                                                                                                                                                                                                                                                                                                                          |
| Idle till after the fix (`8a8c581` APK)                                                 | live + runtime | passed                      | Signed in at 12:24:25 and left idle; "Payments and refunds" at 12:31:50 (7 min 25 s) loaded the list on the first try. A release build logs nothing, so the re-login itself was not observed; the token was past both the 5-minute expiry and the 6-minute point where the API answered `unauthorized`.                                                                                                                                |
| Till at tablet width (emulator at density 200, 864 dp wide)                             | runtime        | passed after a fix          | Menu and order panel side by side, cashier accounts in two columns. The accessibility tree (uiautomator) put the order panel between the first menu rows (problem 9); with the `a8bf5aa` APK the whole menu column comes first, then the order panel. TalkBack itself not run.                                                                                                                                                         |
| Display density change while signed in                                                  | runtime        | observed                    | Android recreated the screen in the same process; the till came back at sign-in because the session lives in memory only, and worked normally after signing in. Font size and system language are not among the manifest's handled `configChanges` either, so they should behave the same (not tested).                                                                                                                                |
| German UI                                                                               | runtime        | passed (spot check)         | Student home in German; strings for all screens typed against the English catalogue.                                                                                                                                                                                                                                                                                                                                                   |
| Physical Pixel XL (Android 10), iPad, iPhone                                            | runtime        | **not run**                 | No physical device was connected (`adb devices` empty); see [manual-tests.md](manual-tests.md).                                                                                                                                                                                                                                                                                                                                        |
| Fingerprint, Android 10 PIN fallback, Face ID                                           | runtime        | **not run**                 | The emulator had no enrolled fingerprint; the device PIN path was exercised there. Fingerprint and the Android 10 behaviour need the Pixel; Face ID needs an iPhone development build.                                                                                                                                                                                                                                                 |
| TalkBack / VoiceOver                                                                    | runtime        | **not run**                 | Labels, roles, headings, announcements and focus moves are in the code; no screen reader was run.                                                                                                                                                                                                                                                                                                                                      |
| OS process kill with an unknown payment                                                 | runtime        | **not run**                 | Simulated in tests (new controller, same store). The till restart above was a real process restart, but with a settled order.                                                                                                                                                                                                                                                                                                          |
| Live 426 / 503 / slow responses                                                         | live           | **not run**                 | No remote control for these exists; covered by simulated tests only.                                                                                                                                                                                                                                                                                                                                                                   |

| APK (artifacts/android/)                                  | Version (code) | ABI                    | SHA-256                                                            |
| --------------------------------------------------------- | -------------- | ---------------------- | ------------------------------------------------------------------ |
| `mensa-student-1.0.0-2-arm64-v8a-8a8c581.apk`             | 1.0.0 (2)      | arm64-v8a              | `6dd60e2ad392f14f7ca2f32917d62316f5987ea0044860a0a161b356b6a6e374` |
| `mensa-student-1.0.0-2-armeabi-v7a+arm64-v8a-8a8c581.apk` | 1.0.0 (2)      | armeabi-v7a, arm64-v8a | `6221d6f29aa76b9b5d8d7639f67cb9b794ab3fc3dae748715bc14dda38c649f3` |
| `mensa-till-1.0.0-2-arm64-v8a-a8bf5aa.apk`                | 1.0.0 (2)      | arm64-v8a              | `4f9806d917510287bc4e98a2b5b828d40ca9594d8810808a6ea69c77fdc06be9` |
| `mensa-till-1.0.0-2-armeabi-v7a+arm64-v8a-a8bf5aa.apk`    | 1.0.0 (2)      | armeabi-v7a, arm64-v8a | `4ea03bd389a38e92b044297683b685e43de37250a8b3aefafa62d3a6c89458d9` |

All four are signed with the same certificate as the stage 2 student APK (SHA-256
`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, the React Native template debug
key), so they install over it with `adb install -r` and keep its saved data. The till APKs built from
`8a8c581` (`fb48429d…`, `7cf9f7ad…`) are still in `artifacts/android/` but lack the fix for problem 9.

### Problems found by verification, and fixes

1. **Blank student screens.** Every student screen rendered empty on Android, without an error. Found
   by bisecting in Expo Go: NativeWind did not apply classes to `KeyboardAvoidingView`, so the
   screen wrapper collapsed to zero height. The wrapper now uses a plain style.
2. **A second NativeWind copy.** Adding `react-native-svg` to the till (an optional peer of
   `react-native-css-interop`) made pnpm create a second css-interop and NativeWind copy. React
   Native's own components resolved one copy, app code the other, and list paddings disappeared in
   the student app. The till now draws its QR with plain Views, svg is gone, and `pnpm check` fails
   if react, react-native, react-native-css-interop or nativewind exists twice.
3. **Microphone and unused permissions.** `recordAudioAndroid: false` did not remove RECORD_AUDIO
   (expo-camera's library manifest declares it), and the till inherited biometric permissions from
   androidx.biometric. `android.blockedPermissions` in each `app.json` removes them, plus the
   template's storage and overlay permissions.
4. **Android lint failure.** iOS usage descriptions in `locales/*.json` became Android string
   resources without a default; they now sit under the `ios` key.
5. **Idle sessions.** The till's payment list failed three times with a generic error after about
   seven idle minutes. The release build logs nothing, so the failing responses were not seen, but
   the timing matches a live observation: a token expired for about a minute is answered with
   `401 unauthorized`, not the documented `session_expired`. The coordinator now logs in again on
   both (new test, mutation-checked), and the same idle test with the `8a8c581` APK loaded the list.
6. **A restored checkout waited for "Check again".** After a restart a paid or expired order is not
   polled and the cache is empty; the panel now reads it once by itself.
7. **Wording**: a pending refund was described as "no answer yet"; a paid amount was labelled
   "Amount to pay". Both fixed.
8. **Recovery could attribute an earlier attempt** (checkpoint 1 above).
9. **Screen-reader order on the tablet layout.** Android leaves plain containers out of the
   accessibility tree and sorts their contents by screen position, so in the till's two-column
   checkout the order panel (heading, hint, "Create order and show QR code") fell between the first
   menu rows. Each column is now kept as a group (`collapsable={false}`,
   `importantForAccessibility="yes"`, commit `a8bf5aa`). iOS needed no change: React Native's views
   return `shouldGroupAccessibilityChildren = YES` for VoiceOver.
10. Smaller: the scanner re-reads the camera permission when the app returns from Settings; the QR
    library with a burst of eight releases in four days was avoided in favour of `qrcode` 1.5.4.

Emulator automation notes (not app bugs): the emulator lost installed apps between restarts; Gboard's
stylus tutorial captured `adb input text` (fixed with `settings put secure stylus_handwriting_enabled
0` on the emulator); uiautomator dumps were stale while the till re-renders its countdown, so
screenshots were used instead. The density check above was undone with `wm density reset`.

Disk: 88 GiB free on the home volume at the end of stage 3 (`df -h /`, 2026-11-01); nothing was
removed in this stage.

## Stage 4: finance dashboard and submission documentation (2026-11-01)

### What was built

- **Finance rules** (`@mensa/domain/finance`, a separate entry point the native apps never import):
  a read-only API bound to one session with bounded retries for transient read failures
  (`createFinanceApi`); the daily report store (`DailyReportStore`); the cursor-chain export
  (`collectPayments`); the CSV writer (`paymentsToCsv`).
- **Berlin calendar days** (`@mensa/shared`): `berlinDayStart`, `berlinDayRange`, `berlinDayBound`,
  `formatCalendarDay`, `formatBerlinTime`.
- **Dashboard** (`apps/dashboard`): public-demo sign-in of the seeded `finance` account, daily totals
  per mensa and till, payments that need attention, filtered transactions with cursor paging, payment
  detail with refunds and full history, complete CSV export, diagnostics; German and English; hash
  routes; build-time validation of `VITE_*`.
- **Native follow-ups**: one announcement path for VoiceOver and TalkBack, only on the focused screen
  (`useAnnouncement`); announcements added for payment status on detail screens, scan problems, an
  invalid typed code and payments being blocked; the result screen no longer moves focus and
  announces the same words. Both apps raised to build 3.
- **Docs**: [design.md](design.md) (new), README, review guide walkthroughs, corrected manual tests.

### Verification

| Check                                                                                                                | Kind               | Result         | Evidence / notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                                                         | source/build       | passed         | 153 tests in 46 suites, including the dashboard's own tests (the root test command now runs `apps/dashboard/src/**/*.test.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Commits checked in isolation                                                                                         | source/build       | passed         | `pnpm check` on `2d139a5` alone (135 tests, the earlier dashboard still builds) and on `0f503cf` alone (152 tests).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Mutation checks (finance)                                                                                            | mutation           | 15 caught      | Berlin range end and host zone, filter end day and till reset, late and wrong-day reports, a failed refresh keeping its copy, retry bound and final refusals, repeated cursor, version merge, empty page, formula and line-break quoting, refund failure not shown as a declined payment. Two survived at first and showed test gaps, now fixed (problems 5 and 6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm bundle:native`                                                                                                 | bundle             | passed         | iOS and Android, both apps, after the native change; the export and CSV code is absent from the Android bundles (checked by string).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Dashboard production build                                                                                           | build              | passed         | 314 kB JS (93 kB gzip); a build without `VITE_SEEDED_PASSWORD` stops with a message (checked).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Live browser check, local build (`pnpm dashboard:browser-check`)                                                     | live + browser     | passed (36/36) | Headless Chrome 156, fresh profile, `http://localhost:4173`: sign-in; no token in storage; report rows and figures equal the API response for 25 Oct (net −€2.70) and 23 Oct; net = gross − refunds at every level; today's Berlin date by server time; attention list equals `needsAttention=true` (9); paging 2 × 50; four filter combinations equal the API; mensa change clears the till; reversed range refused; filtered CSV (229 rows) and full CSV (5,582 payments, 28 pages) equal independent traversals; cancel and filter change save no file; detail with 2 refunds and 6 events; readable 404; German with `lang="de"`; no sideways scroll at 390 px, cards on a phone; reload asks to sign in and reopens the deep link; sign-out; no CORS block; preflights allow `X-Candidate-Id` and `Authorization`; no page errors. |
| Session after idle (`--idle`)                                                                                        | live + browser     | passed (37/37) | After 6.5 idle minutes, "Refresh" sent `GET /reports/daily-totals` → `401`, then `POST /sessions` → `201`, then the same `GET` → `200`, and the report showed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Report against payment lists                                                                                         | live               | passed         | 23 Oct: the report's 223 confirmed payments and €811.60 equal the confirmed payments of the Berlin-day range `2026-10-23T00:00:00+02:00` to `2026-10-24T00:00:00+02:00`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Release APKs from `1b75e2b`                                                                                          | build              | passed         | Four APKs, version 1.0.0 (3); table below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Build 3 on the emulator (smoke)                                                                                      | runtime            | passed         | Installed over build 2 with its data. Student: sign-in, Home with the gate card, history, payment detail (refunds, history), scan screen with the camera denied, a mistyped code ("This order code is not valid."), an unknown order ("Order not found"). Till: sign-in, payments, payment detail. No crash in the crash log. Announcements are not audible in this run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Deployed dashboard, automated (`pnpm dashboard:browser-check -- --url https://zahln-mensa-dashboard-4ft.pages.dev/`) | deployed + browser | passed (36/36) | Run by the owner on 2026-11-02 and once more independently (11:42 CET): the same 36 checks as locally, from the deployed HTTPS origin in a fresh Chrome profile. Sign-in; reports equal the API (25 Oct net −€2.70, 23 Oct €811.60); attention list (9); four filters and paging; payment detail; filtered (229) and full (5,582 payments, 28 pages) CSV exports equal independent traversals; cancellation; German; 390 px; deep-link reload; sign-out. CORS from this origin: 49 preflights, `Access-Control-Allow-Origin: *`, none blocked.                                                                                                                                                                                                                                                                                          |
| Deployed files                                                                                                       | deployed           | checked        | `index.html`, the JavaScript and the CSS served at the production URL are byte-identical to a build of `7c08d2f` (dashboard code unchanged since `0f503cf`). Plain HTTP answers `301` to HTTPS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Deployed dashboard, manual                                                                                           | deployed           | partly run     | The owner signed in with the finance demo account and opened Daily totals, Needs attention and Payments. D1–D4 of [manual-tests.md](manual-tests.md) (keyboard only, VoiceOver, private-window walk-through with the CSV opened in a spreadsheet, deep link in a new private window) not run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Idle session on the deployed URL (`--idle`)                                                                          | deployed           | **not run**    | Passed only against the local build (row above).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Physical devices, fingerprint, Face ID, TalkBack, VoiceOver                                                          | runtime            | **not run**    | See [manual-tests.md](manual-tests.md). The emulator accessibility tree and bundle success are not screen-reader passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

| APK (artifacts/android/)                                  | Version (code) | ABI                    | SHA-256                                                            |
| --------------------------------------------------------- | -------------- | ---------------------- | ------------------------------------------------------------------ |
| `mensa-student-1.0.0-3-arm64-v8a-1b75e2b.apk`             | 1.0.0 (3)      | arm64-v8a              | `7cae41ee0fd1dfd51b654968481ca6c346ba862ceb8aeacad9f945ef3ebcc5eb` |
| `mensa-student-1.0.0-3-armeabi-v7a+arm64-v8a-1b75e2b.apk` | 1.0.0 (3)      | armeabi-v7a, arm64-v8a | `a0ef8e37338949d2587f619c2f9910cb5b2597a9966c8a5b6e710de8a6ca55d5` |
| `mensa-till-1.0.0-3-arm64-v8a-1b75e2b.apk`                | 1.0.0 (3)      | arm64-v8a              | `9c04e3b7c273fea0063a196e3fa676483cbc8078e89b02aa312ac23d50098625` |
| `mensa-till-1.0.0-3-armeabi-v7a+arm64-v8a-1b75e2b.apk`    | 1.0.0 (3)      | armeabi-v7a, arm64-v8a | `231f17d736aef0272e17689bfa1b265258abeea97b2ec76b3ce253d8d703c235` |

All four: minSdk 24, targetSdk 36, the same signing certificate as every earlier build
(`fac61745…3b9c`, the React Native template debug key), the same permissions as build 2, so they
install over earlier builds with `adb install -r` and keep their saved data. Built with
`pnpm apk:*` from a clean tree at `1b75e2b`. The build-2 files (`8a8c581`, `a8bf5aa`) are still in
`artifacts/android/`.

### Deployment (2026-11-02)

Cloudflare Pages, project `zahln-mensa-dashboard`, production branch `main`, direct upload of a local
`pnpm dashboard:build` (no repository access for the host). Production URL: https://zahln-mensa-dashboard-4ft.pages.dev/;
this upload: https://9b7d6d23.zahln-mensa-dashboard-4ft.pages.dev. Redeploy steps: README,
"Dashboard deployment".

### Problems found by verification, and fixes

1. **Stage 3 said iOS could not announce payment-status changes** because it has no live regions.
   Wrong: `useAnnouncement` already used `announceForAccessibility`, which VoiceOver hears. The audit
   found the real gaps instead: announcements were not tied to the focused screen; a message that
   disappeared and came back was not announced again; the result screen moved focus to its heading
   and announced the same title; detail screens, scan problems and a blocked gate relied on Android
   live regions or nothing. Fixed in `1b75e2b`; VoiceOver itself is still unverified.
2. **Manual test N1 overstated what airplane mode shows.** Airplane mode before "Pay" can only show
   the offline path: the gate or the server-time check may stop the payment before any request.
   The manual tests now separate offline, unknown, pending and lost-response cases, and the
   process-kill test needs a payment that is really saved as unresolved.
3. **A render read the clock.** The attention list's age column called `Date.now()` during render;
   the React lint rule caught it. Server time now comes from a small interval hook (`useServerNow`).
4. **Browser-check harness**: table cells with visually hidden context ("Kasse 1 (Mensa am Campus)")
   arrive with a line break, and the API echoes only the headers a preflight asked for; headless
   Chrome may leave a stray `downloads.html.crdownload`. The check now normalises cell text, judges
   preflights per request type, and counts only export files.
5. **The "any host time zone" test proved nothing** (found by a mutation that read offsets in the
   host zone and survived). It changed `TZ` inside the test process, but the formatter is created
   when the module loads, in this Mac's own Berlin zone. The test now runs the functions in child
   processes with `TZ` set to Los Angeles, Tokyo, Kiritimati and UTC.
6. **CSV quoting of a value with only a line break was untested** (a mutation survived): the test
   value also had a comma and a quote. A value with only a CRLF is now tested.

## Manual steps

1. **pnpm on PATH**: `corepack enable pnpm` (undo: `corepack disable pnpm`), or prefix commands with
   `corepack`.
2. **Seeded password**: put the password from the OpenAPI description's "Seeded logins" table into
   `EXPO_PUBLIC_SEEDED_PASSWORD` in `apps/student/.env` and `apps/till/.env`, and into
   `VITE_SEEDED_PASSWORD` in `apps/dashboard/.env` (all git-ignored), before building or starting
   Metro. It is public mock data, inlined into the apps and the dashboard.
3. **Pixel XL (student)**: enable USB debugging; `adb devices -l`;
   `adb shell getprop ro.product.cpu.abilist` (expect `arm64-v8a,…`); then
   `adb -s <serial> install -r artifacts/android/mensa-student-1.0.0-3-armeabi-v7a+arm64-v8a-1b75e2b.apk`
   (or the arm64 file). It replaces an earlier build in place and keeps its data. Set a PIN and enrol
   a fingerprint, then follow [manual-tests.md](manual-tests.md).
4. **iPad (till) in Expo Go**: install Expo Go from the App Store (it still supports SDK 54; Expo:
   "Expo Go on the Apple App Store stops at SDK 54"). `pnpm till` on the Mac, same network, scan the
   terminal's QR with the iPad camera. If Expo Go asks, sign in to the same Expo account as the CLI.
5. **iPhone 17 Pro (student with Face ID)**: Expo Go cannot use Face ID, so this needs a development
   build. Xcode → Settings → Accounts → add your Apple ID (a free personal team works; profiles last
   7 days); enable Developer Mode on the phone; connect it; then `cd apps/student &&
pnpm exec expo run:ios --device` (generates `ios/`, runs CocoaPods; several GB). If the bundle ID
   is taken for your team, change `ios.bundleIdentifier` in `app.json`.
6. **Gradle JDK pin**: `~/.gradle/gradle.properties` pins JDK 11 globally; `pnpm apk:*` passes JDK 17
   per build and leaves the file alone.
7. **Dashboard host**: done (Cloudflare Pages, https://zahln-mensa-dashboard-4ft.pages.dev/). After a change, redeploy with the
   README's steps and run `pnpm dashboard:browser-check -- --url <URL>` again.
8. **Accounts**: invite the reviewers to the private repository when ready. An Expo account for EAS
   is not set up (not needed).

## Remaining for stage 5: submission

1. Run the device tests in [manual-tests.md](manual-tests.md) with build 3 (Pixel, iPad, iPhone,
   TalkBack, VoiceOver) and record each as passed, failed or not run here. UI changes may follow
   from them; the design is not frozen.
2. Run the dashboard's manual checks D1–D4 on the deployed URL.
3. Final read-through of the README and [design.md](design.md); invite the reviewers; rehearse the
   review with [review-guide.md](review-guide.md).
