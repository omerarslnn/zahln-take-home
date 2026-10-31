# CLAUDE.md

Guidance for AI coding sessions in this repository. Keep it short and true; update it when facts change.

## The task

ZAHLN frontend take-home "The Mensa Lunch Rush": one payment flow across three surfaces in one
TypeScript monorepo, against a deliberately unreliable mock API (`https://dev.zahln.de`).

- `apps/student` (Expo, iOS + Android): pick a seeded user (student, staff or guest), scan a till QR,
  see mensa, items and amount, confirm with biometrics or PIN, see the result; payment history
  (including payments still being checked) with a detail view.
- `apps/till` (Expo, tablet): ring up an order from the menu and show its QR, show the payment result,
  refund in full or in part with a clear error when refunding is not allowed.
- `apps/dashboard` (React + Vite, web): daily totals per mensa and per till, payments that need
  attention, search with full history per payment, CSV export.

Required: an installable Android build, the dashboard on a public URL, German and English on every
screen that is built, and a pay flow that works with a screen reader. Evaluation order: correctness
(money never moves twice, no screen shows an untrue result), ownership, product quality, shippability,
code quality.

Sources: the task PDF, Gaurav's API email and the job posting are local-only in `brief/` (git-ignored).
The API contract used by the code is `packages/api/openapi/openapi.json`, a byte-identical copy of the
supplied file. Never modify `brief/`. Record live-spec differences in `docs/api-notes.md`.

## Current stage

Stage 2 (payment rules) is done; see `docs/progress.md`. `@mensa/domain` implements intents,
recovery, sessions, server time, gates and reconciliation, tested against a SIMULATED server
(`packages/domain/src/testing/`). Both native apps wire it in, but there are no payment screens yet:
nobody signs in, scans, pays or refunds through the UI.

Live writes: the only one allowed is `pnpm api:order-probe` (one cashier order per saved intent; a
re-run reuses the saved key and only reads). It created two orders on 2026-10-31 because of a since
fixed bug. **No live payment or refund** until a stage explicitly asks for one. Never add an automatic
offline payment queue or a background payment retry: writes happen only on a user action.

## Commands

```sh
pnpm install            # pnpm 10.34.9 via Corepack (packageManager field); fetches pinned Node 24.22.2
pnpm toolchain          # prints the Node.js/pnpm that actually run project scripts
pnpm check              # format:check + lint + typecheck + test + dashboard production build
pnpm student | pnpm till | pnpm dashboard     # Metro 8081 | Metro 8082 | Vite 5173
pnpm bundle:native      # expo export for iOS and Android (both apps)
pnpm api:generate       # regenerate packages/api/src/generated from the contract copy
pnpm api:smoke          # opt-in live check: GET /config, POST /sessions, GET /mensas, CORS preflights
pnpm api:spec-diff      # opt-in: compare the live OpenAPI document with the committed copy
pnpm api:order-probe    # opt-in, WRITES one live cashier order (QR format probe); see README
pnpm apk:student        # standalone release APK (debug-keystore signed) into artifacts/android/
```

Run tools through `pnpm` so they get the pinned Node.js (`useNodeVersion` in `pnpm-workspace.yaml`,
mirrored in `.nvmrc` and `engines`). The system `node` on this Mac is 23.11 and is not used by scripts.

## Boundaries

- Dependency direction: `apps/* → @mensa/domain → @mensa/api`, and `apps/* → @mensa/shared`.
  `api` and `shared` do not import each other.
- `packages/*/src` is platform-neutral: no `react-native`, `expo*`, `nativewind`, `react-dom`,
  `node:*`, `process`, `window`/`document`. ESLint enforces this. React-only bindings live under
  `@mensa/shared/react`.
- Never hand-edit `packages/api/src/generated/`. Change the contract copy deliberately, then
  `pnpm api:generate`.
- No `console` in app or package source: tokens, passwords, bodies, amounts tied to users and
  personal data must never be logged.
- Native apps read config only as literal `process.env.EXPO_PUBLIC_*`; the dashboard uses `VITE_*`.
  Both are public (inlined into bundles). No secrets in any client env.

## Payment invariants

Invariants 1–10 are enforced in `@mensa/domain` and `@mensa/api` and covered by deterministic tests
against the simulated server (mutation-checked; see `docs/progress.md`). No UI or live payment
exercises them yet, and the UI halves (show the server's amount, pay exactly that, show only
`confirmed` as paid) arrive with the screens. 11 and 12 are still design constraints.

1. Money is integer cents (EUR). The API resolves prices by the authenticated payer's price group;
   the client never computes a price. It sends back the amount it showed (`amount_mismatch` guards).
2. The QR identifies the order (`qrPayload`), not an amount. Observed format:
   `zahln://pay?order=<orderId>` (`parseOrderQr`, `docs/api-notes.md`). Never fetch a scanned URL;
   load the order from the configured API origin.
3. One persisted idempotency key and one immutable request payload per intent (order, payment,
   refund). Every retry of that intent reuses both; a new key means a new intent. The server keeps
   keys for 24 hours per user, so a record older than that must be reconciled by reading, not resent.
4. A timeout, `502 connection_dropped`, `504 timeout` or missing response after a write is an
   unknown outcome, not a failure. `pending` is not `confirmed`; only `confirmed` means paid. No
   optimistic payment success, ever.
5. A stale read cannot establish that an ambiguous write never happened.
6. Reconcile orders and payments by `version` across mutation responses, polling, lists and details;
   never replace a higher version with a lower one (`newerOf`). Observed exception: order expiry keeps
   the version, so `isLaterOrderState` accepts `open` → `expired` at an equal version, and nothing else.
7. Scope caches and recovery records to candidate ID and user ID.
8. Re-authentication (`401 session_expired`; tokens last at most 5 minutes) must preserve the pending
   intent and must never let it continue under a different account.
9. Server time (`Date` header) governs expiry. Local expiry never resolves an outstanding payment.
10. Refunds have their own `pending`/`completed`/`failed` lifecycle; pending refunds reserve
    refundable capacity.
11. Finance reports use Europe/Berlin days. CSV export follows every page (cursor) of the selected
    filter, not only the visible page.
12. Local biometric or PIN confirmation is a device-side gate. The mock API cannot verify it, so it
    is not server-verifiable payment approval.

## Conventions

- Strict TypeScript everywhere. Expo SDK 54 is pinned on purpose: this Mac has Xcode 26.1.1 and
  SDK 55+ needs Xcode 26.2+ (see README). React 19.1.0 everywhere, exact pins.
- App version: `expo.version` in `apps/*/app.json` (1.0.0, the server's `minAppVersion`), read at
  runtime as `appVersion` in `apps/*/src/api.ts` and sent as `X-App-Version`. Bump it there; generated
  native projects pick it up on the next `expo prebuild --clean`.
- Android builds need JDK 17. `~/.gradle/gradle.properties` on this Mac pins JDK 11 globally; leave it,
  and build through `pnpm apk:*`, which passes `-Dorg.gradle.java.home` for JDK 17.
- Styling: NativeWind 4 + Tailwind 3 with the shared preset `@mensa/shared/tailwind-preset`
  (tokens in `packages/shared/src/tokens/tokens.json`). Minimum touch target 48.
- Comments explain decisions, not syntax. JSDoc on public functions. Keep functions short enough to
  explain in an interview.
- Tests: `node:test` via `tsx`, colocated `*.test.ts`, only for behaviour worth protecting. Test
  doubles live in `packages/*/src/testing/` and are never exported from a package index (Metro does
  not tree-shake; they would ship in the app bundles).
- The student and till apps keep identical copies of `src/payments/*` and `SecureStorageCheck.tsx`;
  change both.
- Keep `docs/progress.md` and `docs/api-notes.md` in step with actual results; mark checks as passed,
  failed, blocked or not run.
