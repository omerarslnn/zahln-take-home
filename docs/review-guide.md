# Review guide

For walking through the code and changing it live. Each recipe names the files to touch and the
command that proves the change.

## Reading order (about 20 minutes)

1. `package.json`, `pnpm-workspace.yaml`: workspace layout, pinned pnpm, every root command.
2. `packages/api/src/transport.ts`: the only HTTP entry point. Four result kinds; no retries, no logs.
3. `packages/api/src/client.ts` and `schemas.ts`: typed endpoints, mandatory idempotency keys on
   writes, and the decoders that turn a 2xx body into a resource or into `invalid_response`.
4. `packages/domain/src/write-outcome.ts`: what one write attempt proves, by documented Problem code.
5. `packages/domain/src/intent.ts`: the intent record, its states and its pure transitions
   (`afterUnapplied`, `withPayment`, `paymentDisplay`, `replayPermission`).
6. `packages/domain/src/intent-controller.ts`: start → save → send → settle → read. The comments at
   `reuse`, `runAttempt` and `observePayment` carry the main decisions.
7. `packages/domain/src/session.ts`, `server-clock.ts`, `payment-gate.ts`: re-login without account
   crossover, server time from `Date` headers, the version and maintenance gate.
8. `packages/domain/src/resource-cache.ts`, `versioning.ts`: newest-version rule, detail projection,
   and the observed order-expiry exception.
9. `packages/domain/src/intent-controller.test.ts` and `testing/fake-server.ts`: the failure scenarios
   and the simulated server they run against.
10. `apps/student/src/payments/`: the SecureStore adapter and the provider that wires everything into
    the app; `components/PaymentAvailability.tsx` and `SecureStorageCheck.tsx`.
11. `eslint.config.mjs`: the platform boundary as rules.

## Native concepts, mapped

| Here                                                            | Familiar native equivalent                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `app.json` (`ios.bundleIdentifier`, `android.package`, version) | Info.plist + Gradle `defaultConfig`                                                                      |
| `expo prebuild` → git-ignored `android/` + `ios/`               | Generating the Gradle/Xcode projects from config; they are build output                                  |
| Config plugin (`expo-secure-store` in `app.json`)               | Manifest/Info.plist edits applied at generation time (here: Android backup exclusion rules)              |
| Metro dev server (8081/8082)                                    | A live-reloading asset server feeding the JS VM; release builds embed Hermes bytecode instead            |
| `@react-navigation/native-stack`                                | `UINavigationController` / a Fragment back stack (real native transitions)                               |
| NativeWind `className="bg-brand"`                               | Style resources; compiled to React Native style objects at build time                                    |
| `messages.ts` + `I18nProvider`                                  | `strings.xml` / `Localizable.strings` with an in-app language override                                   |
| `TransportResult`, `StartOutcome`, `AttemptOutcome` unions      | Kotlin `sealed class` / Swift `enum` with associated values                                              |
| `packages/domain`                                               | A pure Kotlin/Swift module with no Android/UIKit imports                                                 |
| `IntentController` + `IntentStore`                              | A repository that writes an outbox row (Room/Core Data) before the network call, but never auto-retries  |
| Expo SecureStore adapter                                        | Keychain item with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` / Keystore-encrypted preferences   |
| `SessionCoordinator`                                            | An OkHttp `Authenticator` behind a mutex (one refresh for all 401s), plus an account check               |
| `ServerClock`                                                   | Server time from `Date` + `SystemClock.elapsedRealtime()` / `CACurrentMediaTime()`, never the wall clock |
| `Poller.setActive` from `AppState`                              | `repeatOnLifecycle(STARTED)` / `scenePhase` pausing work in the background                               |
| `PaymentGate`                                                   | A remote-config forced-update check, minus the store link (the API has none)                             |
| `ResourceCache`                                                 | An upsert that only writes when the incoming row's version is higher                                     |
| `EXPO_PUBLIC_*` / `VITE_*`                                      | `BuildConfig` fields / Info.plist values: readable from the binary, never secrets                        |
| Release APK signed with `debug.keystore`                        | A release variant signed with the debug key: installable, not publishable                                |

## Boundary rules in one breath

Apps may import packages; packages never import apps. `api` and `shared` do not know each other;
`domain` builds on `api`. Package source must run unchanged in Hermes, the browser and Node, so it
has no React Native, Expo, DOM, Node built-ins or `console`. React bindings live behind
`@mensa/shared/react`. Storage, key generation and timers are injected into the domain by each app.

## Live-change recipes

**Add or change a UI string**

1. Add the key to `en` in `packages/shared/src/i18n/messages.ts`.
2. `pnpm typecheck` now fails until the same key exists in `de` (that is the point).
3. Use it: `const { t } = useI18n(); t('my.key', { name })`.

**Add a documented error code to the write classification**

1. Put the code in `FINAL` (judges the action), `CIRCUMSTANTIAL` (nothing happened, may succeed
   later) or leave it out (then it counts as "maybe applied") in
   `packages/domain/src/write-outcome.ts`.
2. Add a case to `write-outcome.test.ts`; `pnpm test`.

**Change the replay window or the polling rhythm**

- `REPLAY_WINDOW_MS` in `packages/domain/src/intent.ts` (must stay below the server's 24 h). The
  retention test in `intent-controller.test.ts` moves the clock past it.
- `DEFAULT_BACKOFF_MS` and `DEFAULT_BUDGET_MS` in `packages/domain/src/poller.ts`, or per controller
  through the `polling` option.

**Depend on a new response field**

1. Add it to the decoder in `packages/api/src/schemas.ts` (`d.optional(...)` / `d.nullable(...)` if
   the contract says so; the `Fields<T>` type rejects a field the generated type does not have).
2. `pnpm typecheck && pnpm test`. A body without a required field now becomes `invalid_response`.

**Show a payment intent on screen (next stage)**

Subscribe to the controller (`controller.subscribe`), read `controller.get(key)`, and switch on
`paymentDisplay(record)`. Only `confirmed` is success; `checking` and `pending` are never shown as
paid or declined.

**Add a screen to the student app**

1. Add the route and its params to `RootStackParamList` in `apps/student/src/navigation.tsx`.
2. Add `<Stack.Screen name="…" component={…} options={{ title: t('…') }} />`.
3. Navigate with `navigation.navigate('…')`; TypeScript checks route names and params.

**Change a colour or add a token**

1. Edit `packages/shared/src/tokens/tokens.json` (and map it in `tailwind-preset.cjs` if it is new).
2. All three apps pick it up: `pnpm dashboard:build`, or restart Metro with `--clear`.
3. Check text contrast stays ≥ 4.5:1 (table in `docs/architecture.md`).

**Change a port or a native identifier**

- Metro ports: `start`/`android`/`ios` scripts in `apps/*/package.json` (8081, 8082).
- Dashboard ports: `apps/dashboard/vite.config.ts` (5173, 4173). The smoke check's simulated
  origins come from `ZAHLN_SMOKE_ORIGINS`.
- IDs: `ios.bundleIdentifier` / `android.package` in `apps/*/app.json`, then `pnpm apk:student`
  (prebuild regenerates `android/`).

**Point the apps at another API or candidate**

Edit `apps/*/.env` (and the root `.env` for scripts), then restart Metro with `--clear` or rebuild:
the values are inlined at build time. Saved intents are scoped by candidate ID, so another
candidate never sees them.

**Contract change**

Replace `packages/api/openapi/openapi.json` deliberately (keep `brief/` untouched), run
`pnpm api:generate`, then `pnpm typecheck`. Note the change in `docs/api-notes.md`.

**Share a React Native component between student and till**

Today the two apps keep small identical copies (`Foundation.tsx`, `ConnectionCheck.tsx`,
`SecureStorageCheck.tsx`, and everything in `src/payments/`). To share them, create
`packages/native-ui` with `react-native`, `react`, `nativewind` and `react-native-css-interop` as
peer + dev dependencies at exactly the apps' versions, move the files, add
`../../packages/native-ui/src/**/*.{ts,tsx}` to both apps' Tailwind `content`, and confirm
`node_modules/.pnpm` still holds a single `react-native@0.81.5_*` folder. A second copy, created by a
different peer set, crashes at runtime. Do not import it from the dashboard.

## Likely questions and where the answer is

- _Why is the intent saved before the request?_ A crash after sending must still find the key, so a
  retry reuses it instead of paying twice (`runAttempt`). If saving fails, nothing is sent.
- _Why does a refusal after a timeout not mean "failed"?_ The earlier attempt may have been applied;
  `order_already_paid` on a retry can be our own payment. `maybeApplied` is sticky (`afterUnapplied`).
- _Why 23 hours?_ The server keeps keys 24 hours; after that the same key would create a new payment.
  Age is measured in server time, with an hour of margin (`replayPermission`).
- _Why not the device clock?_ The user can change it. `ServerClock` uses `Date` headers plus a
  monotonic clock; a test changes the device clock and nothing moves.
- _Why refuse everything when one saved record is unreadable?_ It could be an unresolved intent for the
  same action; that is how the second live order happened (`docs/progress.md`, stage 2, problem 1).
- _Why can a lost payment not be recovered by reading the payment list?_ No payment carries its
  idempotency key. After a declined attempt, a new attempt for the same order, payer and amount
  looks identical, and a stale read can show the old one. Only the same-key resend proves which
  payment is ours (`observePayment`; regression tests in `intent-controller.test.ts`).
- _Why does the till not show the payment gate?_ The API checks the payer app's version, not the till's.
- _Why is order expiry accepted at an equal version?_ Observed live: expiry does not grow `version`
  (`docs/api-notes.md`, observation 7). Nothing else is accepted at an equal version.
- _Is the password stored?_ No. The seeded account's password stays in memory for the 5-minute
  re-login, a mock-specific mechanism; bearer tokens are memory-only too. Records hold IDs, amounts
  and states only.
- _Is there an offline queue?_ No. Writes happen only on a user action; polling only reads.
- _Why Expo SDK 54, not 58?_ This Mac's Xcode 26.1.1; SDK 55+ needs Xcode 26.2–26.4+ (README).
- _Why do the native apps list `react-native-css-interop` and `@babel/plugin-transform-react-jsx`?_
  NativeWind relies on hoisting; pnpm's isolated layout makes those dependencies explicit
  (architecture notes, point 3).
- _Is the candidate ID a secret?_ No: a data namespace, embedded in every client build.
- _What is verified on devices?_ The table in `docs/progress.md`. The tests run against a simulated
  server; the app runs were on an emulator and in Expo Go, not on a physical phone, and no payment
  screen exists yet.
