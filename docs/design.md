# Design document

The decisions behind the Mensa Lunch Rush implementation, for reviewers. Details and diagrams:
[architecture.md](architecture.md); evidence: [progress.md](progress.md); API observations:
[api-notes.md](api-notes.md).

## 1. One architecture for three surfaces

```
apps/student (Expo)   apps/till (Expo)   apps/dashboard (React + Vite)
        \                  |                   /
         └──── @mensa/domain (+ /finance) ────┘      @mensa/shared: i18n, formatting, tokens
                        |
                   @mensa/api: contract types, one transport, runtime decoders
```

- **One HTTP path.** Every request goes through `packages/api/src/transport.ts`: `X-Candidate-Id`
  on every call, bearer token in memory, timeouts, Problem parsing, the server's `Date`. The client
  validates every 2xx body; a body that fails validation is "invalid response", never a success.
- **Money rules live in `@mensa/domain`**, platform-neutral and tested against a simulated server:
  intents with persisted idempotency keys, write classification, the session coordinator, the
  server clock, the payment gate and version reconciliation. The apps are thin React layers.
- **Finance rules are a separate entry point** (`@mensa/domain/finance`): read-only API, the daily
  report store, the export traversal and the CSV writer. The native apps never import it, and Metro
  does not tree-shake, so none of it ships in the phone or till bundles.
- **Boundaries are enforced**, not just documented: ESLint forbids platform imports and globals in
  `packages/*/src` and `console` in app code; `pnpm check` fails if React, React Native or NativeWind
  exists twice.

## 2. States and failures

### Phone (payer)

| Client state | Meaning                                                                 | Shown as                                                                                  |
| ------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ready`      | Intent saved, nothing sent yet                                          | Pay button (after local authorization)                                                    |
| `submitting` | Saved with its key **before** the request leaves                        | "Paying…"                                                                                 |
| `applied`    | The server answered with this payer's payment for this order and amount | The server's status: `pending` = being checked, `confirmed` = paid, `declined` = not paid |
| `unknown`    | Timeout, `502`, `504`, no response or an unreadable body: maybe applied | "Outcome not known yet", with "Check again" and "Send again safely" (same key, same body) |
| `rejected`   | A documented refusal that proves nothing was applied                    | Not paid, with the reason                                                                 |

Only `confirmed` is ever shown as paid. A resend reuses the saved key and body, so the server
answers a repeat with the original payment instead of charging twice. Keys live 24 hours on the
server; after 23 hours by server time the app stops resending and only reads.

| Failure                                                    | Handling                                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `503 unavailable`                                          | Nothing happened; safe to try again (the user decides).                                             |
| `502`, `504`, no response                                  | Outcome unknown; never "failed", never "paid".                                                      |
| `401 session_expired` (or the observed `401 unauthorized`) | One shared re-login of the same account, one repeat with the same key; never under another account. |
| `426` / `paymentsEnabled: false`                           | The gate blocks new payments with an explanation; history still works.                              |
| Stale read                                                 | `version` decides; a lower version never replaces a higher one.                                     |
| Offline                                                    | The gate or the server-time check can refuse before anything is sent.                               |
| App killed                                                 | Records are saved before sending; the next start resumes them for that user only.                   |

### Till

Order intent: create → `open` (QR, countdown on server time) → `paying` → `paid` or `expired`. The
till keeps the checkout until the server says paid or expired; there is no cancel endpoint. Refunds
have their own lifecycle (`pending`, `completed`, `failed`); a pending refund reserves its amount,
and an unresolved refund blocks another refund of the same payment.

### Dashboard (finance, read-only)

| View         | States                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Daily totals | loading · loaded with "last fetched" · refresh failed (earlier copy kept and labelled) · failed with no numbers (never zeros) |
| Lists        | loading · more pages · end of list · failed (loaded rows kept, retry)                                                         |
| Export       | running with progress · complete (file saved) · failed (no file) · cancelled (no file)                                        |

## 3. Releases that cannot rely on instant hotfixes

A store release takes days and many phones never update, so the server must be able to protect
money without a new build:

- **Kill switch and minimum version.** `GET /config` carries `paymentsEnabled` and `minAppVersion`;
  the app sends `X-App-Version`, and a `426` blocks new payments with an "update required" message.
  Reading history keeps working.
- **Tolerant data.** Decoders reject what would be unsafe to show and ignore new optional fields;
  saved intent records gain fields with defaults (`lastSentAt`), so an update reads older records;
  a record that cannot be read blocks new payments instead of risking a duplicate.
- **Traceable builds.** Version 1.0.0 with a build number raised for every device build; APK names
  carry the source commit and `-dirty` for uncommitted changes.
- **What production adds.** EAS Update with a runtime-version policy for JavaScript-only fixes,
  staged store rollouts, and crash reporting. None of these are in this take-home; the server-side
  gates stay the emergency brake.
- The dashboard is a static site: a fix is a redeploy.

## 4. Device security and data protection

- **Credentials.** Bearer tokens live in memory only. The mock has no refresh token, so the session
  coordinator keeps the signed-in account's credentials (typed, or a demo account's) in memory to
  log the same account in again, and drops them on sign-out, on a failed or wrong-role sign-in and
  on a refused re-login. Mock-only: acceptable for public test accounts, never for real ones
  (production: refresh tokens or a device-bound credential). Typed passwords are never persisted
  or logged; the fields are marked for the platform's password managers.
- **Roles.** Each app accepts only its own roles (payers in the student app, cashiers in the till,
  finance on the dashboard), checked inside the session coordinator before the session is published.
  The server still enforces every permission; the client check only keeps a wrong account from
  appearing.
- **Stored data.** Intent records in Expo SecureStore (Keychain / Keystore-backed) hold IDs, amounts,
  keys and states: no token, password or name. They are excluded from Android backups and scoped
  to candidate and user.
- **Local authorization** (fingerprint, face, device PIN) is a device-side gate, bound to user,
  order, amount and the reviewed screen. The mock server cannot verify it; a real system needs a
  server-verifiable approval (a device key signing a challenge).
- **No logs, no analytics.** ESLint rejects `console` in app code.
- **QR codes** are parsed, never opened: only `zahln://pay?order=<id>` is accepted, and the order is
  read from the configured API.
- **Permissions**: camera only (student). Microphone, storage and overlay permissions are removed.
- **Dashboard**: nothing in localStorage or cookies, so a reload signs out. Server text is rendered
  as text. The CSV export carries payer IDs, not names; text cells that look like formulas are
  neutralised.
- **Public by design**: the API origin, the candidate ID and the mock's demo password are inlined
  into client bundles and documented as public.

### Accounts and registration (not implemented)

The API can only log seeded accounts in (`POST /sessions`); it cannot create users, so the apps
offer no sign-up and no password reset and say so on the sign-in screen. A production system would
need, at least:

- **Verified identity, not self-declared roles.** Students and staff sign in through the
  university's identity provider (OIDC or SAML, opened in the system browser:
  `ASWebAuthenticationSession`, Custom Tabs, with PKCE), and the server derives the price group from
  verified enrolment or employment. The app never chooses or sends a price group. Guests get a
  self-service account (email verified) that the server places in the guest group.
- **Server endpoints** for registration, email verification, password reset (single-use, expiring,
  rate-limited tokens sent out of band), refresh tokens with rotation and revocation, and account
  deletion (GDPR), with passwords hashed server-side (e.g. Argon2id) and abuse protection.
- **Cashier accounts provisioned by the operator**, bound to a mensa and a till, ideally on a managed
  (MDM) device, with a short PIN to switch cashiers rather than a full password at every shift.
- **Passkeys or a device key** for sign-in and for server-verifiable payment approval (section 4).

## 5. Technology choices

| Choice                                                            | Why                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Expo SDK 54, React Native 0.81, React 19.1                        | Newest SDK this Mac's Xcode can build; one React version across all apps.                        |
| pnpm workspaces (isolated)                                        | Undeclared dependencies fail early; one lockfile.                                                |
| NativeWind 4 + Tailwind 3                                         | One token preset for phone, till and web.                                                        |
| Vite + React for the dashboard, no router or UI framework         | Five screens: hash routes in a few dozen lines, small domain stores via `useSyncExternalStore`.  |
| Hash routes                                                       | Deep links and reloads work on any static host, with no rewrite rules.                           |
| openapi-typescript + hand-written decoders                        | Types from the contract; runtime checks under our control.                                       |
| `node:test` via tsx                                               | Domain and finance logic tested without a test framework.                                        |
| expo-camera, expo-local-authentication, expo-secure-store, qrcode | SDK-native modules; `qrcode` draws the QR without react-native-svg, which duplicated NativeWind. |

## 6. What we would change in the API

- Look up a write by its idempotency key, or return the key on orders, payments and refunds, so a
  lost response can be settled by reading, also after 24 hours.
- Give reports a version or ETag and a generated-at time; offer a server-side CSV export or a
  snapshot cursor, so an export is consistent across pages; return a total count with lists.
- Answer every ended session with `401 session_expired`; add refresh tokens.
- Registration, verification and password-reset endpoints, or sign-in through the university's
  identity provider, with the price group derived on the server.
- Grow `Order.version` on expiry, as documented.
- Declare `X-Candidate-Id` (required), `X-App-Version`, `Date` and `Idempotent-Replayed` in the spec.
- Specify and sign the QR payload.
- An endpoint to acknowledge or assign a payment that needs attention; an exact `orderId` filter.
- Server-verifiable payment approval.

## 7. Known limitations

- **Debug-signed APKs**, not store builds.
- **Client-side mock authentication**: the published test password is inlined into the apps and
  the dashboard for the one-tap demo accounts; typed sign-in works without it. No registration or
  password reset (the API has none).
- **Language changes on iOS** need the app to restart, which iOS does itself; Android switches live.
- **No lookup by idempotency key**: an unknown payment older than 24 hours stays unknown; an unknown
  refund keeps blocking further refunds of that payment.
- **Unversioned reports and exports**: "last fetched" is when a copy arrived; an export is a complete
  traversal of the cursor chain, not an atomic snapshot.
- **Device verification pending**: Pixel (fingerprint, Android 10 PIN fallback), iPad, iPhone Face
  ID, TalkBack and VoiceOver ([manual-tests.md](manual-tests.md)).
- **Observed API discrepancies** handled in code: expired tokens answer `401 unauthorized`; order
  expiry keeps the version.
