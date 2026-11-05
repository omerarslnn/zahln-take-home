# Design document

The decisions behind the Mensa Lunch Rush implementation, for reviewers. It describes the code as
it is now. Details and diagrams: [architecture.md](architecture.md); evidence:
[progress.md](progress.md); API observations: [api-notes.md](api-notes.md); a guided tour:
[review-guide.md](review-guide.md).

The guiding rule: **money never moves twice, and no screen shows a result the server has not
given.** Everything below serves one of those two halves.

## 1. Architecture and shared boundaries

```
apps/student (Expo)   apps/till (Expo)   apps/dashboard (React + Vite)
        \                  |                   /
         └──── @mensa/domain (+ /finance) ────┘      @mensa/shared: i18n, formatting, tokens
                        |
                   @mensa/api: contract types, one transport, runtime decoders
```

- **One HTTP path.** Every request goes through `packages/api/src/transport.ts`: `X-Candidate-Id`
  and `X-App-Version` on every call, the bearer token in memory, a 15-second timeout, Problem
  parsing and the server's `Date`. The client validates every 2xx body; a body that fails
  validation is an "invalid response", never a success.
- **Money rules live in `@mensa/domain`**, platform-neutral and tested against a simulated server
  that can lose responses, time out, refuse, reorder and replay: intents with persisted idempotency
  keys, write classification, the session coordinator, the server clock, the payment gate, version
  reconciliation and the authorization binding. The apps are React layers on top: each screen is a
  container (hooks, guards, navigation) and a pure view.
- **Finance rules are a separate entry point** (`@mensa/domain/finance`): the read-only API, the
  daily report store, the export traversal and the CSV writer. The native apps never import it
  (Metro does not tree-shake), so none of it ships in the phone or till bundles.
- **Boundaries are enforced**, not only documented: ESLint forbids platform imports and globals in
  `packages/*/src` and `console` in app code; `pnpm check` fails if React, React Native or NativeWind
  exists twice, and if the files the two native apps share drift apart.

## 2. Payment, order and refund state machines

Every write is an **intent**: saved with its idempotency key and its exact request body before
the request leaves, then moved through these client states. The server's own status (`pending`,
`confirmed`, …) is shown inside `applied`.

```
ready ──send──▶ submitting ──2xx──▶ applied (server status decides what is shown)
                    │
                    ├──documented refusal (4xx that proves nothing happened)──▶ rejected
                    └──timeout · 502 · 504 · no response · unreadable 2xx──▶ unknown
unknown ──"Send again safely" (same key, same body, within the replay window)──▶ submitting
unknown ──read shows the result for this intent──▶ applied
```

### Payment (student)

| Client state | Meaning                                                                   | Shown as                                                                                     |
| ------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ready`      | Reviewed and authorized locally, saved, not sent                          | The review with "Pay €…"                                                                     |
| `submitting` | Saved with key and body; the request is on its way                        | "Paying…"                                                                                    |
| `applied`    | The server answered with this payer's payment for this order and amount   | `pending`: being checked · `confirmed`: paid · `declined`: not paid                          |
| `unknown`    | Maybe applied: timeout, `502`, `504`, no response or an unreadable body   | "Outcome not known yet", "Check again" (reads only) and "Send again safely" (same key, body) |
| `rejected`   | A refusal that proves nothing was applied (expired order, amount changed) | Not paid, with the reason                                                                    |

Only `confirmed` is ever shown as paid; `pending` polls with backoff (1, 2, 4, 8, 10 s, at most
three minutes, then "Check again"). A confirmed payment is never downgraded by a stale read:
`version` decides (section 3).

| Failure                                                    | Handling                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `503 unavailable`                                          | Nothing happened; the user may try again (same intent).                                                      |
| `502`, `504`, timeout, no response                         | `unknown`: never "failed", never "paid".                                                                     |
| `409 amount_mismatch`, order expired or already paid       | `rejected` with the reason; "already paid by someone else" says the payer was not charged.                   |
| `401 session_expired` (or the observed `401 unauthorized`) | One shared re-login of the same account, then the same request with the same key (section 4).                |
| `426` / `paymentsEnabled: false`                           | The gate blocks new payments and resends; reading history and reconciling keep working (section 6).          |
| Stale or reordered read                                    | A lower `version` never replaces a higher one.                                                               |
| App killed or restarted                                    | The saved record comes back for the same user and stays `unknown` until its own resend or a read settles it. |

### Order (till)

`create order` is an intent too: `applied` shows the order's QR code while the server says `open`,
"being checked" for `paying`, then `paid` (with the payer's amount and price group) or `expired`.
The till keeps the order until one of those final answers: there is no cancel endpoint, so nothing
lets a cashier abandon an order that a payer may be paying. A create request without an answer is
resent with the same key; it can be closed only once any order it could have created must have
expired unseen (its QR was never shown and order IDs are unguessable).

### Refund (till)

```
form ─amount ≤ server's refundable, reason─▶ confirmation ("Refund €X to <payer>?") ─▶ refund intent
refund intent: submitting ─▶ applied: pending ─▶ completed | failed
                          └─▶ unknown ─"Send again safely" (same key)─▶ submitting
```

- Capacity is the server's `refundableAmountCents`, which already reserves pending refunds. The
  controller reads it again right before sending; the form refuses more than it, and the
  confirmation holds only while the newest figure still covers the amount.
- One refund action per payment at a time: a second tap, a second screen or a second device cannot
  create a second refund; an unresolved refund (pending or unknown) blocks the next one and can never
  be dismissed, also not after a restart.
- A failed refund leaves the payment confirmed. Partial refunds accumulate; "Refund everything left"
  fills the server's figure, it does not compute one.

## 3. Lost responses, retries, idempotency and persistence

- **One intent, one key, one body.** A key is created once per user action and saved with the
  exact request body in Expo SecureStore before the request leaves (if saving fails, nothing is
  sent). Every retry of that intent reuses both; a new key only ever comes from a new deliberate
  action. Two rapid taps produce one intent, one key and one request.
- **Why a timeout is not a decline.** The request may have reached the server and been applied
  while the answer was lost. Showing "declined" would invite a second payment; showing "paid" could
  be false. So the app says "not known yet" and offers a read ("Check again") and a resend that the
  server deduplicates ("Send again safely").
- **The replay window.** The server keeps keys for 24 hours per user. The app resends only while the
  first attempt is less than 23 hours old **by server time** (from the `Date` header, bounded by the
  request delay; the device clock is never used). Beyond that, or while server time is unknown, only
  reads are used, because the same key could then create a new payment. An unknown outcome older
  than that stays unknown and is shown as such.
- **A stale read cannot prove a negative.** A list that does not (yet) show a payment does not mean
  it was never made, so reads only ever settle an intent positively.
- **Versions.** Orders and payments carry `version`; the cache keeps the highest one seen across
  write responses, polling, lists and details. The one observed exception, order expiry at an equal
  version, is accepted for `open` → `expired` only.
- **No automatic money movement.** No offline queue, no background retry, no retry loop: every
  write starts with a user action. Polling and gate re-reads are reads, bounded and stopped when the
  screen or app goes away.

## 4. Sessions, biometric authorization and user isolation

- **Sessions.** Tokens last at most five minutes and the mock has no refresh token. The session
  coordinator keeps the signed-in account's credentials in memory (never persisted or logged), and on
  `401 session_expired` (or `401 unauthorized` about a minute after expiry, as observed) signs the
  **same** account in again once for all waiting requests, then repeats the request with the same
  key. Sign-out, a refused re-login and a wrong-role sign-in drop the credentials.
- **Roles.** The student app accepts payers, the till cashiers and the dashboard finance; the role
  is checked inside the coordinator before a session is published, so a wrong account never appears.
  The server still enforces every permission (a till sees only its own payments).
- **User isolation.** Saved intents and caches are scoped to candidate ID and user ID. Another
  account never sees, resends or settles them; an unknown payment stays recoverable for its own
  user after an account switch.
- **Local authorization** (fingerprint, Face ID, device PIN through `expo-local-authentication`) is
  a device-side gate. `PaymentAuthorizer` binds one prompt to the user, the order, the server's
  amount and the reviewed screen: a cancelled or failed prompt, a device without a screen lock, a
  changed account, order or amount, or a screen that was left all send nothing. The mock server
  cannot verify it, so it is **not** server-verifiable approval; a production system would sign a
  server challenge with a device-bound key (passkey or Secure Enclave / StrongBox key), as strong
  customer authentication requires.

## 5. Security, device storage and privacy

This is a take-home against a public mock API; it is not banking-grade security, and these notes say
where the mock forces shortcuts.

- **Stored on the device:** intent records only (IDs, amounts, keys, states, timestamps), in Expo
  SecureStore (iOS Keychain `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, Android Keystore-backed), excluded
  from Android backups. No token, password or name is stored. A record that cannot be read blocks
  new payments rather than risking a duplicate.
- **In memory only:** the bearer token and, for the mock's re-login, the signed-in account's
  password. Mock-only: acceptable for public test accounts, never for real ones.
- **Public by design:** the API origin, the candidate ID (a data namespace, not a credential) and
  the mock's published demo password are inlined into the client bundles for the one-tap demo
  accounts. Client builds cannot keep secrets, so none are in them.
- **No logs or analytics:** ESLint rejects `console` in app code; nothing about users or amounts is
  logged.
- **QR codes are parsed, never opened:** only `zahln://pay?order=<id>` with a bounded ID alphabet is
  accepted; the order is loaded from the configured API.
- **Permissions:** the camera (student) and nothing else that touches personal data; microphone,
  storage, overlay and Wi-Fi-state permissions are removed. The till has no camera or biometrics.
- **Dashboard:** nothing in localStorage, sessionStorage or cookies (a reload signs out); server
  text is rendered as text; the CSV carries payer IDs, not names, and neutralises cells a
  spreadsheet would run as formulas.
- **No registration.** The API can only log seeded accounts in. Production would sign students and
  staff in through the university's identity provider (OIDC with PKCE in the system browser) and
  derive the price group on the server; cashiers would be provisioned per mensa and till on managed
  devices; refresh tokens with rotation, passkeys and GDPR account deletion would follow.

## 6. Remote kill switch and minimum app version

- `GET /config` carries `paymentsEnabled` and `minAppVersion`. The app sends `X-App-Version`
  (`expo.version`, 1.0.0); the server answers `426` to an outdated app.
- **Fail closed.** No payment starts or is resent until the newest read of the configuration says
  payments are enabled and this version is allowed. A missing, failed or malformed answer keeps
  payments blocked with one explanation; reading history and reconciling earlier payments continue.
- **It recovers by itself** (`GateRecovery`): the configuration is read at start-up, when the app
  returns to the foreground, when the connection comes back (student, via `expo-network`), at 5, 15,
  30 and 60 seconds after a read that got no answer, and when the user taps "Check again". Only the
  newest read counts, so a slow old answer cannot reopen payments. Screens derive their single
  notice from the live gate and never keep a copy.

## 7. Releasing an app that cannot be hotfixed

A store release takes days to reach users and many phones never update, so the server must be able
to protect money without a new build, and every build must be traceable.

- **Versioning.** `version` (semantic, 1.0.0, what `minAppVersion` compares) plus a build number
  that grows with every build handed out (`android.versionCode`, `ios.buildNumber`; now student 7,
  till 6). APK file names carry version, build, ABIs and source commit (`-dirty` for uncommitted
  changes).
- **Signing.** The APKs here are release builds signed with the project's **debug key**: installable
  and updatable over each other, **not Play Store ready**. Production uses Play App Signing with an
  upload key kept in a secret store (CI), and an Apple distribution certificate in the team; the
  signing key must be chosen before the first store release, because changing it forces a reinstall.
- **Staged rollout.** Internal testing (Play internal track, TestFlight), then a staged rollout
  (Play percentages, App Store phased release over seven days), widening only while monitoring is
  clean.
- **Monitoring.** Crash and error reporting with release health per version (for example Sentry,
  with personal data scrubbed), plus server-side metrics by `X-App-Version`: unknown-outcome rate,
  resends, `426` responses, declined and refunded payments.
- **Forced update.** Raise `minAppVersion`: outdated apps stop starting payments, say "update
  required" and keep showing history. The server must stay compatible with every version still
  allowed.
- **Rollback.** A binary cannot be recalled: halt the staged rollout, ship a fixed build with a
  higher build number, and use the levers that do not need a release: `paymentsEnabled: false` for an
  emergency stop, `minAppVersion` to retire a broken build. JavaScript-only fixes could ship through
  EAS Update bound to a runtime version, with their own staged rollout and rollback (not set up here).
- **Data across versions.** Decoders ignore new optional fields; saved intent records gain fields
  with defaults, so an update reads older records; an unreadable record fails closed.
- **The dashboard** is a static site: a fix is a redeploy (Cloudflare Pages keeps earlier
  deployments for an instant rollback).

## 8. Technology choices and tradeoffs

| Choice                                                                        | Why                                                                       | Tradeoff                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Expo SDK 54, React Native 0.81, React 19.1                                    | Stable, patched SDK with the needed native modules; one React everywhere  | Not the newest SDK; kept pinned for stability through the review            |
| pnpm workspaces (isolated)                                                    | Undeclared dependencies fail early; one lockfile                          | Expo needs a few hoisting rules (`pnpm-workspace.yaml`)                     |
| Domain logic in a platform-neutral package, tested with `node:test`           | Money rules testable without a device or UI framework                     | The simulated server must be kept faithful to the live API (`api-notes.md`) |
| Copied native primitives instead of a shared native UI package                | Avoids a second NativeWind/css-interop copy, which silently breaks styles | Two copies, kept identical by `pnpm check:copies`                           |
| NativeWind 4 + Tailwind 3                                                     | One token preset for phone, till and web                                  | Tailwind 3, not 4 (NativeWind's stable line)                                |
| Vite + React, hash routes, no router or UI framework                          | Five screens; deep links work on any static host                          | Hand-written routing and tables                                             |
| openapi-typescript + hand-written decoders and transport                      | Types from the contract; retry and validation semantics explicit          | Decoders must follow contract changes                                       |
| expo-secure-store for intents                                                 | Keychain/Keystore-backed, survives restarts                               | Small value size (records are bounded and checked)                          |
| expo-camera, expo-local-authentication, expo-network, expo-keep-awake, qrcode | SDK-native modules; QR drawn with Views                                   | `expo-network` is a hint only: the server's answer decides                  |
| Debug-key-signed local release APKs                                           | Installable today without accounts                                        | Not store builds (section 7)                                                |

## 9. What is missing from the API, and what we would change

- **Look up a write by its idempotency key**, or return the key on orders, payments and refunds, so a
  lost response can be settled by reading, also after 24 hours.
- **Server-verifiable payment approval** (a signed device challenge).
- **Refresh tokens**, and every ended session answered with `401 session_expired`.
- **Reports with a version or ETag** and a generated-at time; a server-side export or a snapshot
  cursor, so an export is consistent across pages; total counts with lists.
- **An order cancel endpoint** for the till, with the same idempotency rules.
- Grow `Order.version` on expiry, as documented.
- Declare `X-Candidate-Id` (required), `X-App-Version`, `Date` and `Idempotent-Replayed` in the spec.
- Specify and sign the QR payload.
- An endpoint to acknowledge or assign a payment that needs attention; an exact `orderId` filter.
- Registration, verification and password reset, or sign-in through the university's identity
  provider with the price group derived on the server.

## 10. Deliberately not implemented

| Not built                                   | Why                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Offline payment queue, background retries   | A queued or automatic write can move money the user no longer expects; every write needs a tap. |
| Order cancellation                          | No endpoint; hiding an order would let a payer pay an order the till forgot.                    |
| Sign-up, password reset, price-group choice | The API has none, and the price group must come from the server.                                |
| Crash reporting, analytics                  | No backend or consent flow in scope; production would add both (section 7).                     |
| CI (GitHub Actions), EAS Build and Update   | `pnpm check` runs the same gates locally; CI would run it plus the bundles and APK builds.      |
| Push notifications                          | Not required; results arrive through bounded polling while the screen is open.                  |
| Play-signed / TestFlight builds             | Need store accounts; the APKs are debug-key signed (section 7).                                 |
| A dashboard session that survives a reload  | Keeping tokens in storage would trade security for convenience in a finance tool.               |

## Accessibility

The payment flow is built for screen readers: every status is words plus an icon (never colour
alone); a row, an amount or a timeline event is one spoken phrase; nothing interactive sits inside a
grouped element; status changes are announced once, on the focused screen only; the result moves
focus to its heading; side-by-side columns are separate reading groups; touch targets are at least
48 dp; text wraps up to the largest system sizes; the one animation respects reduced motion. Status:
Android accessibility trees, larger text and both languages are checked on the emulator, and the
dashboard is checked with the keyboard in a browser; **TalkBack and VoiceOver on the physical
devices are still to run** ([manual-tests.md](manual-tests.md), "Screen readers").

## Known limitations

- **Debug-signed APKs**, not store builds; iOS builds are development builds from source.
- **Mock authentication**: the published test password is inlined for the one-tap demo accounts;
  credentials are held in memory for the re-login.
- **No lookup by idempotency key**: an unknown payment older than the replay window stays unknown;
  an unknown refund keeps blocking further refunds of that payment.
- **Unversioned reports and exports**: "last fetched" is when a copy arrived; an export is a complete
  traversal of one cursor chain, not an atomic snapshot.
- **Language changes on iOS** restart the app (iOS does this itself); Android switches live.
- **Observed API discrepancies**, handled in code: expired tokens answer `401 unauthorized`; order
  expiry keeps the version.
