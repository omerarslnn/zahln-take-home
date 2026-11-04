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

## Phase 0: baseline before the product polish (2026-11-04)

No app behaviour changed. The local setup changes from the first device round were resolved with
evidence, the device results recorded, and BUG-01 documented for Phase 1.

### Setup changes resolved

| Local change                                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `expo-dev-client ~6.0.21` added to the till                                       | Kept: it runs Mensa Till as a development build on the iPad. But a till release APK built with it grew from 28.2 to 41.9 MB (dex 19.1 → 38.2 MB, native libraries 16.6 → 21.6 MB) and gained `ACCESS_NETWORK_STATE`, Google ML Kit barcode scanning, Google Play services and data-transport components, Compose's `PreviewActivity` and an `exp+mensa-till` URL scheme; its JavaScript bundle was byte-identical. Expo autolinking links Android modules into every variant (the `debugOnly` flag is Apple-only). | `expo.autolinking.android.exclude` for the seven dev-client modules (`apps/till/package.json`); `["expo-dev-client", { "addGeneratedScheme": false }]` (`apps/till/app.json`): Expo CLI takes the scheme the native projects share, `mensa-till`, which the iPad build already registers (the generated iOS project it was built from has no `exp+` scheme in its `Info.plist`); `pnpm till:android` / `till:ios` keep opening Expo Go (`--go`). |
| The same install changed the **student** release                                  | pnpm hoisted `expo-dev-client` into `node_modules/.pnpm/node_modules`; pnpm's command shims put that folder on `NODE_PATH`, and Expo prebuild applies the dev client's config plugin whenever it can resolve the package. The student's release manifest gained `exp+mensa-student`.                                                                                                                                                                                                                               | `hoistPattern: ['*', '!expo-dev-client']` in `pnpm-workspace.yaml`; relinked offline with the unchanged lockfile. The student no longer resolves the package; the till still does.                                                                                                                                                                                                                                                               |
| `ios.appleTeamId` in `apps/student/app.json`                                      | Written by `expo run:ios --device` (Expo CLI saves the chosen team when the config has none). The generated, git-ignored iOS projects of both apps hold the team (`DEVELOPMENT_TEAM`), and Expo CLI skips the team prompt when they do.                                                                                                                                                                                                                                                                            | Removed from `app.json`; local signing stays in `apps/*/ios`.                                                                                                                                                                                                                                                                                                                                                                                    |
| `android.permissions` (biometric, fingerprint, camera) in `apps/student/app.json` | Expo's permission plugin only adds; the libraries already declare all three. A student release APK built with the list had the same seven permissions as build 3 (its one manifest difference, `exp+mensa-student`, came from the dev client; see the next row).                                                                                                                                                                                                                                                   | Removed as redundant; no permission was added or dropped.                                                                                                                                                                                                                                                                                                                                                                                        |
| `platforms` array reformatted in `apps/student/app.json`                          | Failed `prettier --check`, so `pnpm check` failed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Restored: the file equals the committed version again.                                                                                                                                                                                                                                                                                                                                                                                           |

Release impact, from arm64 release APKs built from the working tree for comparison only (not
handed out; the build-3 APKs remain the deliverables):

|                                   | Build 3 (`1b75e2b`) | With the dev client, before       | After Phase 0            |
| --------------------------------- | ------------------- | --------------------------------- | ------------------------ |
| Till: size                        | 28.2 MB             | 41.9 MB                           | 28.2 MB                  |
| Till: permissions                 | 3                   | 4 (+ `ACCESS_NETWORK_STATE`)      | the same 3               |
| Till: manifest                    | 4 components        | 12 components, + `exp+mensa-till` | identical to build 3     |
| Till: JavaScript bundle           | 2,318,552 bytes     | identical                         | identical (same SHA-256) |
| Student: manifest and permissions | 7 permissions       | + `exp+mensa-student`             | identical to build 3     |

iOS: `expo-dev-launcher` and `expo-dev-menu` declare `debugOnly`, and in the generated Pods
configuration they appear in Release only in header and compiler search paths, not in the linker
flags. No iOS Release build was made here (it needs an archive with signing), so the iOS Release
content is inferred from that configuration, not measured.

### Physical-device results (2026-11-04)

Run and reported by the owner. **Verified**: run as written, passed. **Partly**: part of the case.
The build number used on each device was not recorded.

| Device               | Scenario                                                             | Manual test | Status                                                                   |
| -------------------- | -------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| Pixel XL, Android 10 | Real QR scan and payment with the iPad till                          | S4, S11     | verified                                                                 |
| Pixel XL             | Device PIN authorization (Android 10 device-lock fallback)           | S9          | verified                                                                 |
| Pixel XL             | Authorization cancelled; double tap gives one payment                | S8, S10     | verified                                                                 |
| Pixel XL             | "Paid" status and the payment in the history                         | S11, H1     | S11 verified; H1 partly (paging and the seeded pending row not reported) |
| Pixel XL             | Offline payment blocked, no false success                            | N1          | verified                                                                 |
| Pixel XL             | Payment availability recovered after returning to the foreground     | —           | verified (foreground only; see BUG-01)                                   |
| Pixel XL             | Background and resume during a payment                               | N5          | verified                                                                 |
| Pixel XL             | History after 6 idle minutes without signing in again                | N7          | verified                                                                 |
| Pixel XL             | Offline history keeps the loaded rows and warns                      | H3          | verified                                                                 |
| iPad A16             | Checkout and QR creation                                             | T1, T3      | partly (rotation not reported)                                           |
| iPad A16             | QR payment confirmed from another real device                        | T4          | verified                                                                 |
| iPad A16             | Open order and QR kept across an app restart                         | T5          | verified                                                                 |
| iPad A16             | Partial refund of €1.00                                              | T6          | verified                                                                 |
| iPad A16             | Invalid refund amounts and formats blocked                           | T7          | verified                                                                 |
| iPad A16             | "Refund everything left", €0.00 refundable                           | T8          | verified                                                                 |
| iPad A16             | Offline refund blocked before sending; one refund after reconnecting | T10         | verified (offline path)                                                  |
| iPad A16             | cashier-campus-1's payment absent from cashier-campus-2's list       | T9          | partly (list scope; a direct read by ID was not checked)                 |
| iPhone 17 Pro        | Student debug build installed; real iPad till QR scanned             | S4          | verified                                                                 |
| iPhone 17 Pro        | Face ID prompt and cancel                                            | S8          | verified                                                                 |
| iPhone 17 Pro        | Face ID payment; device-passcode fallback                            | S11, S9     | verified                                                                 |
| iPhone 17 Pro        | Same result on iPhone and iPad; one payment in the history           | S11, H1     | verified                                                                 |
| Pixel XL, build 4    | Payment availability recovered in the foreground (BUG-01)            | N9          | verified (later on 2026-11-04; see Phase 1)                              |

**Not run on a device**: S2, S3 (camera permission denied), S5–S7 (foreign QR, wrong code, expiry),
S12 (maximum font sizes), S13 (German), N2 (send again after an unknown outcome), N3 (a real lost
response), N4 (a payment that stays pending), N6 (force stop with a genuinely unresolved payment),
N8 (account switch with an unresolved payment), H2, T2, A1–A4 (TalkBack,
VoiceOver), D1–D4 (dashboard manual checks), and S10 on the iPhone.

**Covered only by simulated-server tests**, not by a device: a lost response the server applied
(payments, orders, refunds), a restart with an unknown intent (a new controller on the same store,
not an OS process kill), an unknown refund outcome, the retention window, stale reads, and account
isolation of saved intents.

### BUG-01: payment-availability warnings on the student's review screen (fixed in Phase 1)

Fixed in `deedd3e` (student build 4); causes, fix and evidence in [Phase 1](#phase-1-bug-01-payment-availability-in-the-foreground-2026-11-04).
The record below is as written in Phase 0.

**Observed** (Pixel XL, 2026-11-04): with the review screen open and the internet off, the
availability warning appeared twice. After reconnecting and returning the app to the foreground,
"Pay" was enabled again but one stale warning stayed. Reconnecting while the app stayed in the
foreground did not reliably re-check availability.

**Code paths that fit the observation**, to be confirmed by deterministic tests before any fix:

1. The gate reads `GET /config` only at start-up, on each return to the foreground
   (`PaymentServices`) and before each new payment (`IntentController`). Nothing reacts to the
   connection coming back while the app stays in front, and the review screen hides "Pay" while the
   gate is blocked, so the pre-payment check cannot run either.
2. A blocked pay attempt stores the gate's message in the screen's own state
   (`setMessage(gateMessage(started.gate))` in `ReviewScreen`) next to the live gate notice: two
   warnings with the same text. When the gate reopens, the live notice goes and the stored copy
   stays. `ResultScreen` keeps the same kind of copy after a blocked resend.
3. `PaymentGate.refresh` shares a request that is still on its way (`refreshing ??=`). One that
   started offline can hang until the 15-second transport timeout and hand its "unavailable" answer
   to a refresh asked for after the connection returned.

**Phase 1 acceptance criteria** (from the owner):

- When connectivity returns while the app is in the foreground, payment availability is checked
  again with `GET /config` automatically, without backgrounding, restarting or navigating away.
- Network connectivity alone never enables payments; only the server's answer does. The kill
  switch, the minimum version and the fail-closed behaviour stay.
- Bounded retries with backoff after reconnecting; no constant polling, no racing refreshes, safe
  fallbacks if a network event is missed; an earlier response never overrides a newer gate state.
- Exactly one relevant availability warning; stored copies disappear when the gate opens; an
  enabled "Pay" never appears next to a stale "unavailable" warning.
- Deterministic tests for offline → online in the foreground, duplicate warnings and stale
  responses; then N9 in [manual-tests.md](manual-tests.md) on the Pixel XL.

**Reproduction plan**: unit tests on `PaymentGate` with a fake configuration read that fails,
hangs and then succeeds; a pure function that chooses the review screen's notices; emulator runs
with `cmd connectivity airplane-mode enable|disable` and screenshots; then N9 on the Pixel.

### Checks (2026-11-04, fresh runs)

| Check                                                                                | Result         | Notes                                                                                  |
| ------------------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------- |
| `pnpm check`                                                                         | passed         | 153 tests in 46 suites, Prettier, ESLint, typecheck, single instances, dashboard build |
| `pnpm bundle:native`                                                                 | passed         | iOS and Android, both apps                                                             |
| `pnpm dashboard:browser-check -- --url https://zahln-mensa-dashboard-4ft.pages.dev/` | passed (36/36) | 15:32 CET                                                                              |
| Release APK comparisons                                                              | see above      | Four arm64 builds, compared with build 3                                               |

## Phase 1: BUG-01, payment availability in the foreground (2026-11-04)

Fixed in `deedd3e`; student build 4 carries it. **N9 passed** on the Pixel XL (Android 10, build 4),
run and reported by the owner on 2026-11-04: exactly one availability warning while offline; after the
connection returned, "Pay" became available by itself without leaving the review screen, putting the
app in the background or refreshing; the stale warning was gone. No payment was made during the check.

### Causes, confirmed on the unchanged code (`f84e442`)

Four characterization tests asserted the behaviour of `f84e442` as it was (not committed: the fix
inverts them); all four passed.

1. **Nothing re-checked while the app stayed in front.** `PaymentGate.refresh` ran only at start-up,
   on `AppState` `active` (`PaymentServices`) and before a new payment or resend
   (`IntentController`). After a failed read the gate stayed `config_unavailable` with the network
   back, and the review screen hides "Pay" while blocked, so the pre-payment check could not run
   either.
2. **A stored copy of the gate next to the live one.** A blocked pay attempt returns the gate's
   state; `ReviewScreen` stored it as its message (`setMessage(gateMessage(started.gate))`) and also
   rendered the live gate: the same warning twice. The stored copy stayed blocked after a refresh had
   opened payments: a stale warning next to "Pay". `ResultScreen` stored the same copy after a
   blocked resend.
3. **Late reads decided.** `refresh` shared the read on its way (`refreshing ??=`), so a read that
   left offline (it can hang until the 15-second transport timeout) answered a refresh asked for
   after the network was back. Found while investigating, not observed on a device: a read that left
   before a server refusal (`503 payments_disabled`) reopened payments when it answered later.

### Fixes

- **Only the newest read decides** (`PaymentGate`): every read and every server refusal takes a
  ticket; an answer counts only while its ticket is the newest, and whoever awaits an overtaken read
  gets the newest outcome. Callers still share a read on its way; `refresh({ fresh: true })` starts
  one that overtakes it. A read that throws fails closed. `isRefreshing()` drives a busy button.
- **When to read again** (`GateRecovery`, new in `@mensa/domain`): at start-up; on every return to
  the foreground (afresh if the connection came back meanwhile); when the connection comes back while
  the app is in front, after it has held for 1 second, as a fresh read; after a read without a usable
  answer at 5, 15, 30 and 60 seconds, then not again until one of those events or the user's request;
  and on "Check availability again". A paused kill switch or a higher minimum version is an answer and
  is not re-read on a timer. Nothing runs in the background; dispose stops every timer and listener.
  A connectivity event only schedules a read: payments open only when `GET /config` says so, so the
  kill switch, the minimum version and the fail-closed rule are unchanged.
- **Connectivity source** (`apps/student/src/payments/connectivity.ts`): `expo-network`'s listener,
  one native subscription for the app's lifetime shared by subscribers; "online" means connected and
  not known to lack internet access. Loaded by a dynamic import, so a build without the native module
  (the iPhone development build made before this change) reports nothing and keeps the other
  triggers.
- **One live warning** (`apps/student/src/availability.ts`, `AvailabilityNotice`): the review and
  result screens derive their one availability notice from the live gate on every render and keep no
  copy (`afterPayAttempt` and `afterResend` keep nothing for a blocked attempt; every other reason
  nothing was sent stays visible). A screen shows the notice or its pay action, never both; "Send
  again" on the result screen now waits for the gate as well. "Check availability again" sits outside
  the notice's text group, so screen readers reach it as a button; it is busy while a read is on its
  way, and also appears on the home and diagnostics card where a new answer could help (no answer,
  paused, invalid server minimum; not for an outdated app). A block and "Payments are available."
  are announced through `useAnnouncement`, once per change, on the focused screen only.
- Unchanged: the intent controller, idempotency keys and payloads, saved intents,
  `PaymentAuthorizer`, the session coordinator and navigation. The till passes no gate checks and
  keeps reading at start-up and in the foreground only; its `PaymentServices` copy is identical to the
  student's apart from the header line.

### Dependency: `expo-network ~8.0.8`

| Question            | Answer                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Why this one        | The version SDK 54 pins (`expo install`), first-party, no config plugin. iOS: `NWPathMonitor`. Android: a `ConnectivityManager` network callback. `@react-native-community/netinfo` 11.4.1 (SDK 54's version) reports more than the gate needs.                                |
| Android permissions | It declares `ACCESS_NETWORK_STATE` (build 3 already had it) and `ACCESS_WIFI_STATE`, which only its unused `getIpAddressAsync` needs: blocked in `app.json`. Build 4 has build 3's seven permissions.                                                                          |
| Release size        | +10,044 bytes per APK (classes2.dex +12,772 bytes, JavaScript bundle +10,024 bytes); no native library.                                                                                                                                                                        |
| Both apps' builds   | Student: autolinked on Android and iOS. Till: the autolinking result is unchanged on both platforms (`expo-modules-autolinking resolve`, before and after); the package is in none of Expo prebuild's plugin lists; the till's exported bundles do not contain the module.     |
| iOS                 | The iPhone development build must be built again (`expo run:ios --device`) to include the module; until then the app works without connectivity events. No iOS build was made in this phase.                                                                                   |
| Known limits        | Android: events only on `onAvailable`/`onLost`, so a change can be missed; the spaced retries cover that. iOS: the module cancels its path monitor when its last listener goes and restarts the cancelled monitor for the next one; hence one listener for the app's lifetime. |

### Tests

24 new tests (153 → 177): 4 gate-read tests in `payment-gate.test.ts`, 12 in
`gate-recovery.test.ts`, 4 in `apps/student/src/availability.test.ts` (the real controller, gate
and recovery on the simulated server, and the values the screens render), 4 in
`apps/student/src/payments/connectivity.test.ts`. The root `pnpm test` now includes
`apps/student/src`.

| Required case                                                 | Covered by                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Offline → online in the foreground                            | recovery: "offline → online in the foreground"; availability: "review: one warning while blocked, then none"               |
| A reconnection sends a fresh `GET /config`                    | recovery: "a returned connection sends a fresh GET /config", and the two "while the app is away" cases                     |
| Connectivity back, server unreachable                         | recovery: stays blocked, re-reads at 5/15/30/60 s, then stops; the user's check then opens                                 |
| Reconnection with payments disabled                           | recovery: "payments switched off meanwhile": paused, no timer re-reads                                                     |
| Reconnection with a minimum-version update required           | recovery: "a higher minimum version"                                                                                       |
| A stale or delayed earlier request after a newer one          | gate: a fresh read overtakes a hung one; an older "open" after a newer "paused"; a read before a refusal                   |
| Exactly one relevant warning on Review                        | availability: the review flow; "either the notice or the pay action"; "a blocked attempt keeps nothing"                    |
| The warning disappears once the gate is open                  | availability: the review flow                                                                                              |
| Result after a blocked resend                                 | availability: no copy kept, "Send again" waits, then the same request once, one payment                                    |
| Repeated connectivity events, no duplicate or unbounded reads | recovery: a burst gives one read, a repeated "online" none, concurrent checks share one; connectivity: one native listener |
| Background/foreground and listener cleanup                    | recovery: no reads or timers in the background, one read on return, nothing after dispose; connectivity: unsubscribe       |

**Mutation check**: 27 mutations of the fix (tickets, fresh reads, the refusal guard, the settle
wait, the retry bound, background and dispose, stored copies, notice-or-pay, the connectivity
adapter), each run against the new tests: 27 killed. The first run left two survivors, which led to
two stronger tests (dispose with a timer pending; only "open" pays).

### Android emulator, before and after (2026-11-04)

Medium Phone AVD, Android 16, arm64 (not the Pixel's Android 10; `expo-network` takes the same code
path from Android 10 up). The same steps on both builds: an open order from the till app (build 3) on
the same emulator, its review screen in the student app, airplane mode with
`adb shell cmd connectivity airplane-mode enable|disable`, and "Pay" confirmed with the emulator's
PIN while offline (the pre-payment check fails; nothing is sent). Results read from screenshots: the
accessibility dump fails while the countdown ticks.

| Step                                    | Build 3 (`1b75e2b`)                           | Build 4 (`deedd3e`, installed over build 3 with `install -r`)                                                                                 |
| --------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline, after "Pay"                    | Two identical "could not be checked" warnings | One warning and "Check availability again"; no "Pay"                                                                                          |
| Online again, same screen, app in front | After 20 s: both warnings, no "Pay"           | At 2.8 s: the one warning, the button busy (the read is on its way); at 3.4 s: no warning, "Pay €2.20"; unchanged at 16 s with Wi-Fi back too |
| Background, then foreground             | "Pay €2.20" enabled next to one stale warning | Not needed                                                                                                                                    |

Four live orders (ledger in [api-notes.md](api-notes.md)); two runs ran out of the order's 5 minutes
and were repeated. No payment was created: the till's list shows none after 14:48 that day. This is
emulator evidence, not N9.

### Release build 4 (student)

| APK                                                       | Size             | SHA-256                                                            |
| --------------------------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| `mensa-student-1.0.0-4-armeabi-v7a+arm64-v8a-deedd3e.apk` | 50,749,097 bytes | `5cec2e12c14f7d901f69932c720c5697da36231ee0d444bdf3835c0f7072e703` |
| `mensa-student-1.0.0-4-arm64-v8a-deedd3e.apk`             | 35,906,038 bytes | `ba096d6fedf71713ed7d9f5e402dc23c2ce416045af8926bead47db67dca33d3` |

Built from the clean commit `deedd3e` in `artifacts/android/` (git-ignored). The same debug signing
certificate as build 3 (SHA-256 `fac61745…3b9c`), so it installs over build 3 and keeps the app's
data: `adb -s <serial> install -r artifacts/android/mensa-student-1.0.0-4-armeabi-v7a+arm64-v8a-deedd3e.apk`.
Against build 3: the manifest differs only in `versionCode` and the order of two permission entries;
the same seven permissions; no new component or native library. iOS `buildNumber` is 4 as well; no
iOS build was made. The till stays at build 3: its native build is unchanged, and its JavaScript
changes only through the shared code (the `PaymentServices` copy, `PaymentGate`, `GateRecovery` with
no connectivity and no retries), which reads at start-up and in the foreground as before; checked by
typecheck, tests and its exported bundles, not on a device.

### Checks (2026-11-04, fresh runs)

| Check                                 | Result     | Notes                                                                                             |
| ------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| Characterization tests on `f84e442`   | 4/4 passed | Each confirms one cause; not committed                                                            |
| `pnpm check`                          | passed     | 177 tests in 50 suites, Prettier, ESLint, typecheck, single instances, dashboard build            |
| `pnpm bundle:native`                  | passed     | Both apps, iOS and Android; one bundle per platform; `expo-network` only in the student's bundles |
| Mutation check of the fix             | passed     | 27/27 killed                                                                                      |
| Student release APKs, build 4         | built      | Compared with build 3 above                                                                       |
| Android emulator, build 3 and build 4 | done       | Above                                                                                             |
| N9 on the Pixel XL                    | passed     | Run by the owner on 2026-11-04 with build 4; no payment made                                      |
| TalkBack/VoiceOver on the new button  | not run    | Part of A1–A4                                                                                     |

## Phase 2: design system and UI foundations (2026-11-04)

The foundation for the screen redesigns: tokens, native primitives, their accessibility rules and
a check that keeps the two apps' copies identical. Described in [design-system.md](design-system.md).
No business logic changed: payments, refunds, QR, history, sessions and the availability recovery
are untouched; screens changed only where a primitive's API changed.

### Audit findings that shaped it

- **No 4-point grid on the phones.** NativeWind's native `rem` defaults to 14, so `p-4` was 14 dp,
  `px-3` 10.5 dp and body text (`text-base`) 14 dp, smaller than either platform's default. Both
  apps now set `inlineRem: 16`: every rem-based size grows by 16/14, the same scale as the web.
- **Buttons VoiceOver could not reach.** 13 notices put buttons inside their `accessible` group,
  which VoiceOver treats as one element (the order-load retry and "Show status" on the review
  screen, the camera-permission and scan actions, the till's refund confirmation and retries).
- **Glyphs read aloud.** Status glyphs (✓ ! ✕ •) were text, so screen readers could read "bullet" or
  "exclamation mark" before a notice's title.
- **Faded disabled buttons** (50 % opacity of their tone) and dark `line` dividers used as
  decoration; the dashboard uses only the existing token names.

### What changed

- **Tokens** (`tokens.json`, the Tailwind preset): tonal `*-strong` / `*-subtle` / `*-line` colours
  for brand, success, warning and danger, `fill`, `line-subtle`, a five-step type scale, icon sizes,
  spacing and motion values. Existing names and values unchanged.
- **Primitives** (`apps/*/src/components/ui/`, replacing `ui.tsx` and the generic parts of
  `Foundation.tsx`): Button (primary, secondary, tertiary, danger; grey when disabled; width-keeping
  busy state; optional icon), IconButton, Title / Heading / Body / Caption, Card, Section,
  LabelledValue, ListRow, StatusPill (renamed from StatusBadge, now tonal with an icon), Notice
  (strings plus `actions` outside its group, no children), AmountText, TextField, EmptyState,
  LoadingIndicator, Skeleton (Reanimated, still under reduced motion), BottomActionBar (safe area
  and keyboard aware) and Screen.
- **Icons**: `@expo/vector-icons` 15.1.1 (Ionicons) as a direct dependency of both apps: the
  version `expo` already brought, no native code; the font is preloaded at start.
- **Call sites**: the 23 notices with children use `description` / `actions`; StatusBadge → StatusPill;
  Card and LabelledValue imported from `ui`; the home and diagnostics availability card shows the
  tone's icon instead of a coloured dot, and "Check availability again" sits inside its notice.
- **`pnpm check:copies`** (in `pnpm check`): the listed shared files must exist in both apps and be
  identical apart from the header comment. Shown to fail on a one-line drift and on a file added to
  one copy, and to accept a different header.
- **Design catalogue** (Diagnostics → Design system), development builds only.

**Visible on existing screens**: larger text and spacing (the rem fix), hairline card outlines,
tonal status pills and banners with icons, grey disabled buttons, 1 dp secondary-button borders
instead of 2 dp, actions inside banners laid out below their text. Layouts otherwise unchanged.

### Checks (2026-11-04, fresh runs)

| Check                                          | Result            | Notes                                                                                                                                                                                |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                   | passed            | 226 tests in 54 suites (+49: 30 token contrast pairs, 19 primitive style and label tests), Prettier, ESLint, typecheck, single instances, 31 identical native files, dashboard build |
| `pnpm bundle:native`                           | passed            | Both apps, iOS and Android; the catalogue's strings are in none of the four release bundles; the Ionicons font is the only new asset                                                 |
| `expo install --check`                         | passed            | Both apps: dependencies match SDK 54                                                                                                                                                 |
| Dashboard CSS                                  | unchanged         | Same file and SHA-256 (`707c6598…`); the JS grew 0.6 kB (token data)                                                                                                                 |
| `pnpm dashboard:browser-check`                 | passed (36/36)    | Local build (`pnpm dashboard:preview`) and the deployed site; read-only. A first local run failed because no preview server was running                                              |
| Release APK impact (arm64 comparison builds)   | measured          | Student 35,906,038 → 36,182,158 bytes (+276 kB), till 28,167,488 → 28,448,248 (+281 kB); permissions unchanged (7 and 3). Comparison builds only, not deliverables                   |
| Android emulator, before / after               | done              | Medium Phone AVD, Android 16: sign-in, home, diagnostics, scan, review (an expired order), history, payment detail; till sign-in, checkout, payments, payment detail. Reads only     |
| Larger text                                    | done              | 130 % (the Pixel XL's largest) on home, scan, review and history; 200 % on the catalogue: text wraps, nothing clipped                                                                |
| Tablet layout                                  | done              | Till on the emulator at 800 × 1280 dp (≈ iPad portrait): checkout and payments                                                                                                       |
| iPad simulator (iPad Pro 11-inch M5, iOS 26.5) | partly            | Till in Expo Go: the sign-in screen rendered (SF Pro, new buttons) behind Expo Go's first-run developer-menu sheet; taps could not be automated, so nothing further                  |
| Busy button                                    | checked           | Same bounds before and while busy; Android reports it as disabled and "busy"                                                                                                         |
| Notice grouping in the accessibility tree      | checked (Android) | Scan screen: "Allow camera" inside the notice's focusable group in build 4, a separate element now                                                                                   |
| VoiceOver, TalkBack on devices                 | not run           | A1–A4; the VoiceOver fix is structural and needs the physical pass                                                                                                                   |
| Payment and refund flows on a device           | not run           | No payments or refunds were made; their logic is unchanged and covered by the simulated-server tests                                                                                 |

### Remaining

- Screens still carry raw classes (`text-2xl` titles, `border-line` dividers) until their redesign.
- History rows (student) and payment rows (till) nest an accessible status pill in a button. On
  Android the student's history row was observed to omit the status from its label; the till's rows
  have the same structure. `ListRow` is the replacement.
- Physical screen-reader passes (A1–A4) and the maximum-font check on devices (S12).

## Manual steps

1. **pnpm on PATH**: `corepack enable pnpm` (undo: `corepack disable pnpm`), or prefix commands with
   `corepack`.
2. **Seeded password**: put the password from the OpenAPI description's "Seeded logins" table into
   `EXPO_PUBLIC_SEEDED_PASSWORD` in `apps/student/.env` and `apps/till/.env`, and into
   `VITE_SEEDED_PASSWORD` in `apps/dashboard/.env` (all git-ignored), before building or starting
   Metro. It is public mock data, inlined into the apps and the dashboard.
3. **Pixel XL (student)**: enable USB debugging; `adb devices -l`;
   `adb shell getprop ro.product.cpu.abilist` (expect `arm64-v8a,…`); then
   `adb -s <serial> install -r artifacts/android/mensa-student-1.0.0-4-armeabi-v7a+arm64-v8a-deedd3e.apk`
   (or the arm64 file). It replaces an earlier build in place and keeps its data. Set a PIN and enrol
   a fingerprint, then follow [manual-tests.md](manual-tests.md).
4. **iPad (till)**: development build once with
   `pnpm --filter @mensa/till exec expo run:ios --device --port 8082`, then `pnpm till` (Metro 8082)
   and open Mensa Till. Alternative: the App Store's Expo Go (it supports SDK 54): `pnpm till`, press
   `s`, scan the terminal's QR with the iPad camera.
5. **iPhone 17 Pro (student with Face ID)**: Expo Go cannot use Face ID, so this needs a development
   build. Xcode → Settings → Accounts → add your Apple ID (a free personal team works; profiles last
   7 days); enable Developer Mode on the phone; connect it; then
   `pnpm --filter @mensa/student exec expo run:ios --device` (generates `ios/`, runs CocoaPods;
   several GB), and later `pnpm student` (Metro 8081). The team stays in the git-ignored `ios/`
   project; if Expo CLI writes `ios.appleTeamId` into `app.json`, do not commit it. If the bundle ID is
   taken for your team, change `ios.bundleIdentifier` in `app.json`.
6. **Gradle JDK pin**: `~/.gradle/gradle.properties` pins JDK 11 globally; `pnpm apk:*` passes JDK 17
   per build and leaves the file alone.
7. **Dashboard host**: done (Cloudflare Pages, https://zahln-mensa-dashboard-4ft.pages.dev/). After a change, redeploy with the
   README's steps and run `pnpm dashboard:browser-check -- --url <URL>` again.
8. **Accounts**: invite the reviewers to the private repository when ready. An Expo account for EAS
   is not set up (not needed).

## Remaining for stage 5: submission

1. The UI polish phases agreed on 2026-11-04: the design system is done (Phase 2, awaiting the
   owner's review); sign-in and the student and till screens follow, each with its own checks.
2. Device checks not run yet: TalkBack, VoiceOver, maximum font sizes, N6 with a genuinely
   unresolved payment, and the other rows listed under "Not run on a device"; the dashboard's D1–D4.
3. Final read-through of the README and [design.md](design.md); invite the reviewers; rehearse the
   review with [review-guide.md](review-guide.md).
