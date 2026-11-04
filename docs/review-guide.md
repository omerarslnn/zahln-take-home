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
    the app; then the screens in `apps/student/src/screens/` and `apps/till/src/screens/`.
11. `eslint.config.mjs`: the platform boundary as rules.
12. Finance (stage 4): `packages/domain/src/finance/` (read-only API, `DailyReportStore`,
    `collectPayments`, `paymentsToCsv`), `packages/shared/src/format/berlin-days.ts`, then
    `apps/dashboard/src/finance/` (session, hooks, filters) and `apps/dashboard/src/pages/`.

## Follow one payment through the code

The live payment of 2026-11-01 (staff, €5.80, `pay_90d914f2be37a714`) took this path:

1. **Scan** (`apps/student/src/screens/ScanScreen.tsx`): the camera callback takes `ScanLock`
   synchronously, `parseOrderQr` turns `zahln://pay?order=<id>` into an order ID, and the screen
   navigates to `Review`. The camera unmounts as soon as the screen loses focus.
2. **Review** (`ReviewScreen.tsx`, `useOrder.ts`): `api.getOrder` goes through `ScopedApi` →
   `SessionCoordinator.run` → `client.getOrder` → transport (`X-Candidate-Id`, `X-App-Version`,
   bearer). The answer passes the decoder and `controller.cache.putOrder` (newest version wins); the
   screen shows the server's `amountCents` and counts down on server time.
3. **Native authorization** (`PaymentAuthorizer.run` in `packages/domain/src/payment-authorization.ts`,
   `apps/student/src/local-auth.ts`): the lock is taken before anything awaits; Expo
   LocalAuthentication shows the system prompt (fingerprint, or the device PIN). After it returns,
   user, order, amount and review must be unchanged or nothing is sent.
4. **Controller** (`IntentController.payOrder`): one start per order (`startOnce`), an existing intent
   is reused, the gate reads `GET /config`, server time must be known, a new key comes from
   `expo-crypto`.
5. **Storage before transport** (`runAttempt`): the record is saved as `submitting` through the
   SecureStore adapter (`apps/*/src/payments/secure-intent-store.ts`) before the request leaves; a
   failed save sends nothing.
6. **Transport and session**: `createPayment` with the `Idempotency-Key`; a `401 session_expired` or
   `unauthorized` triggers one shared re-login of the same account and one repeat with the same key and
   body.
7. **Classification and settle** (`classifyWrite`, `isOwnPayment`): a 201 for this order, payer and
   amount links the payment to the intent (`applied`, `pending v1`); anything ambiguous leaves it
   `unknown`.
8. **Polling and cache** (`Poller`, `observePayment`): `GET /payments/{id}` every 1, 2, 4… seconds,
   through `putPaymentDetail`; `withPayment` keeps the higher version (`confirmed v2`).
9. **Result** (`ResultScreen.tsx`): `useControllerRevision` re-renders on the change; `describeOutcome`
   (from `paymentDisplay`) says "Paid" only for `confirmed`; the screen reader hears it once.
10. **Till** (`apps/till/src/screens/CheckoutScreen.tsx`): its own controller polls the order intent
    (`paying v2` → `paid v3`); `PaidResult` reads the payment for the payer's amount and price group.

## Four walkthroughs

### 1. A payment whose response was lost

1. **Pay** (`IntentController.payOrder` → `runAttempt`): the intent is saved as `submitting` with
   its key K and body, then `POST /orders/{id}/payments` goes out. It answers `504 timeout`.
2. **Classify** (`classifyWrite`): a `504` after a write proves nothing, so the intent becomes
   `unknown` with `maybeApplied`; the result screen says "Outcome not known yet", never "declined".
3. **Check again** (`reconcile`, `observePayment`): reads can only settle in the safe direction. An
   order that is `paid` without this payer's payment means "not charged"; no read ever links a
   payment to the intent, because no payment carries its key and a stale list could show an
   earlier attempt.
4. **Send again safely** (`retry`): local authorization again, then the same key and the same body.
   The server answers the original payment (`Idempotent-Replayed: true`); the intent is `applied`
   and polling follows it to `confirmed`.
5. **Killed in between**: the record is in SecureStore; the next start loads it for the same user and
   Home lists it. After 23 hours by server time it is only read, never resent.

Tests: `intent-controller.test.ts`, "recovers a payment the server recorded when the response was
lost, with the same key and body", "after a restart, keeps the saved intent unknown until its own
same-key resend settles it" and "beyond the key retention window it never replays…".

### 2. A cross-day refund in the daily report

25 October 2026 (a Sunday, and a 25-hour day): `GET /reports/daily-totals?date=2026-10-25` returns
no payments, €2.70 of refunds completed and a net of −€2.70. A refund counts on the day it
completed, so a refund of an earlier payment lowers that Sunday's net below zero.

1. `ReportPage` reads the day from the address (`#/report?day=2026-10-25`); with no day, "today" is the
   Berlin date by server time (`useServerNow`, `berlinDateKey`).
2. `useDailyReport` → `DailyReportStore.select(day)` → `FinanceApi.getDailyTotals(day)` (session,
   bounded retries). The store drops answers for a day no longer selected, refuses a report for
   another `date`, and keeps the last good copy with its `fetchedAt` when a refresh fails.
3. `ReportTotals` shows the response's own fields, overall, per mensa and per till; nothing is added
   up from payment lists. The decoder accepts a negative `netCents` (`d.signedCents`); the page
   explains it instead of clamping it.

Evidence: `daily-report.test.ts`; `pnpm dashboard:browser-check` compares every row with the API
response and checks net = gross − refunds at every level.

### 3. A Berlin date filter

The user picks 25.10.2026 to 25.10.2026 and applies the filters.

1. `FilterForm` → `#/transactions?from=2026-10-25&to=2026-10-25` → `filterFromParams` keeps only real
   calendar days.
2. `toPaymentQuery` → `berlinDayBound` (`packages/shared/src/format/berlin-days.ts`):
   `from=2026-10-25T00:00:00+02:00` (inclusive) and `to=2026-10-26T00:00:00+01:00` (exclusive): 25
   hours. 29 March 2026 gives 23. No host time zone is involved; tests run under other zones too.
3. The daily report is a different operation: it takes `date=2026-10-25` and the server converts.

Evidence: `berlin-days.test.ts`, `filters.test.ts`; live, the confirmed payments of the 23 October
range equal that day's report (223 payments, €811.60).

### 4. A CSV export across pages

1. "Export all matching payments" → `useExport.start(filter)` captures the filter (its key and query).
2. `collectPayments` (`packages/domain/src/finance/payment-export.ts`) asks for 200 per page and
   follows `nextCursor` until it is null. A repeated cursor, an empty page that still points onward,
   or a page that fails after the finance API's three attempts ends the export with no file; so does
   a cancel, a new filter or a new session. Pages that overlap are merged by ID, keeping the highest
   version; the result is sorted newest first, then by ID.
3. `paymentsToCsv`: fixed columns, raw cents, ISO times, UTF-8 with BOM, CRLF, RFC 4180 quoting and
   formula neutralisation; `downloadText` saves it and revokes the object URL.

Evidence: `payment-export.test.ts`, `payment-csv.test.ts`; live, 5,582 payments in 28 pages, equal to
an independent traversal.

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
| `PaymentAuthorizer` + Expo LocalAuthentication                  | `BiometricPrompt` with device credential / `LAContext` device-owner authentication, behind a mutex       |
| expo-camera `CameraView` + `ScanLock`                           | CameraX / `AVCaptureSession` with ML Kit / Vision, plus an `AtomicBoolean` against repeated frames       |
| `useControllerRevision` (`useSyncExternalStore`)                | Collecting a `StateFlow` / observing an `@Published` value                                               |
| `navigation.reset` after paying                                 | `popUpTo` / `setViewControllers`, so Back does not return to a stale review                              |
| `app.json` plugins, `blockedPermissions`, `locales`             | Manifest merger `tools:node="remove"`, Info.plist usage strings, `InfoPlist.strings` per language        |
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

**Show a payment intent on screen**

Subscribe to the controller (`useControllerRevision`), read `controller.get(key)`, and switch on
`paymentDisplay(record)`. Only `confirmed` is success; `checking` and `pending` are never shown as
paid or declined.

**Add a CSV column**

1. Add the name to `PAYMENT_CSV_COLUMNS` and the value to `paymentRow` in
   `packages/domain/src/finance/payment-csv.ts`: `csvInteger` for numbers, `csvText` for any text.
2. Extend `payment-csv.test.ts`; `pnpm test`. Document the column in the README if reviewers rely on it.

**Add a transaction filter**

1. Add the field to `TransactionFilter`, `NO_FILTER`, `toPaymentQuery`, `PARAM` and
   `filterFromParams` in `apps/dashboard/src/finance/filters.ts` (validate what comes from the
   address), then a control in `FilterForm` (`apps/dashboard/src/pages/TransactionsPage.tsx`).
2. Extend `filters.test.ts`; the export picks the filter up through `toPaymentQuery` automatically.

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

Today the two apps keep identical copies of the design-system primitives (`src/components/ui/`),
`Foundation.tsx`, `ConnectionCheck.tsx`, `SecureStorageCheck.tsx` and everything in `src/payments/`
except the student-only `connectivity.ts`; `pnpm check:copies` proves they match (the list is in
`scripts/check-native-copies.mjs`). Why copies and not a package: [design-system.md](design-system.md).
To share them anyway, create
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
- _Is the fingerprint check secure?_ It is a device-side gate. The mock server never sees proof of
  it; only the bearer token authorizes the payment. Production needs a server-verifiable approval
  (a device key signing a challenge).
- _Why can a cashier not cancel an open order?_ There is no cancel endpoint. The order expires after
  5 minutes; until it is paid or expired, the till keeps it and starts no other.
- _Why is the QR drawn with Views?_ react-native-svg made pnpm create a second NativeWind copy, which
  broke styling in the other app (`docs/architecture.md`, "One copy of NativeWind").
- _Why does the app log in again on `401 unauthorized`?_ The live API answers a token expired for
  about a minute with `unauthorized`, not `session_expired` (`docs/api-notes.md`).
- _Why do the till's columns set `importantForAccessibility`?_ Without it, Android sorted the contents
  of both columns by position, which put "Create order" between two dishes in the accessibility tree.
- _Why Expo SDK 54, not 58?_ This Mac's Xcode 26.1.1; SDK 55+ needs Xcode 26.2–26.4+ (README).
- _Why do the native apps list `react-native-css-interop` and `@babel/plugin-transform-react-jsx`?_
  NativeWind relies on hoisting; pnpm's isolated layout makes those dependencies explicit
  (architecture notes, point 3).
- _Is the candidate ID a secret?_ No: a data namespace, embedded in every client build.
- _What is verified on devices?_ The tables in `docs/progress.md`. The tests run against a simulated
  server; the app runs were on an Android emulator with release builds and in Expo Go, not on a
  physical phone; no screen reader has been run.
- _Why are the daily totals not added up from the payment list?_ The report counts refunds on the
  day they completed, which a payment list cannot show, and the list is paged. The report response is
  the source; the browser check compares every row with it.
- _Why "last fetched", not "as of"?_ Reports carry no version or snapshot time; the `Date` header
  dates the response, not the data behind it.
- _Why does a failed refresh keep the old numbers?_ They stay labelled with their own fetch time;
  without a good copy no numbers are shown, so a zero is always a zero the server sent.
- _Is the export complete?_ It follows one cursor chain to `nextCursor: null` and saves only then; a
  failed or repeated page, a cancel or a new filter saves nothing. Without a snapshot token, data can
  change between pages: each payment appears once, at the newest version seen.
- _Why the leading apostrophe in some CSV cells?_ Text that starts like a formula (`=`, `+`, `-`,
  `@`, tab, line break) would run in a spreadsheet; quoting alone does not stop that.
- _Why hash routes?_ Deep links and reloads work on any static host without rewrite rules.
- _Why is the finance password in the web bundle?_ It is the mock's published test password, set as
  `VITE_SEEDED_PASSWORD` deliberately; a production dashboard would ship no password.
- _Why is the export code not in the phone apps?_ It lives behind `@mensa/domain/finance`, which the
  native apps never import; Metro would bundle anything imported, used or not.
