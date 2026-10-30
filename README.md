# Mensa Lunch Rush: ZAHLN frontend take-home

One mensa payment flow across three surfaces (student app, till and the Studierendenwerk
dashboard) in one TypeScript monorepo, built against the supplied mock API.

> **Status: stage 1 of 5, foundation.** Three runnable shells, shared packages, a tested HTTP transport
> and a verified live connection to the API. **There is no payment flow yet.** Nothing in this code
> creates orders, payments or refunds. Progress and test records: [docs/progress.md](docs/progress.md).

## What exists today

| Part                   | Implemented                                                                                                                                                                                  | Shell only / not yet                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `apps/student` (Expo)  | Native stack navigation (Start → Connection check), DE/EN switch with device-language default, shared tokens and formatting, live `GET /config` check                                        | User picker, QR scan, pay confirmation, result, history |
| `apps/till` (Expo)     | Tablet-first layout (two columns from 768 dp, stacked on phones), DE/EN switch, shared tokens and formatting, live `GET /config` check                                                       | Order entry, QR display, payment status, refunds        |
| `apps/dashboard` (web) | DE/EN switch (also sets `<html lang>`), shared tokens and formatting, in-browser `GET /config` check that proves CORS and `Date` header exposure                                             | Daily totals, attention queue, search, CSV export       |
| `packages/api`         | Types generated from the contract, platform-neutral transport (timeouts, `X-Candidate-Id`, bearer, idempotency header, Problem parsing, server `Date`, replay flag), opt-in live smoke check | Order/payment/refund endpoints (stage 2)                |
| `packages/domain`      | Version rule (`newerOf`) with tests                                                                                                                                                          | Payment/refund state machines, intent persistence       |
| `packages/shared`      | DE/EN catalogues, euro-cent and Europe/Berlin formatting, design tokens + Tailwind preset, React i18n bindings                                                                               | n/a                                                     |

## Prerequisites

Verified on this setup (see [docs/progress.md](docs/progress.md) for exact results):

| Tool          | Version used                          | Notes                                                                                                       |
| ------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| macOS / CPU   | 26.5.1, Apple M2 (arm64), 16 GB       |                                                                                                             |
| Node.js       | 23.11.0                               | Works, but Node 23 is end-of-life. **Node 24 LTS recommended** (ESLint 10 and Expo SDK 58 exclude Node 23). |
| pnpm          | 10.34.9 via Corepack                  | Pinned in `package.json#packageManager`.                                                                    |
| Xcode         | 26.1.1                                | This is why Expo SDK 54 is used: SDK 55 needs Xcode 26.2+, SDK 56–58 need 26.4+.                            |
| JDK           | 17 (Zulu)                             | React Native 0.81 needs JDK 17.                                                                             |
| Android SDK   | platform 36, emulator 36.3, phone AVD | NDK 27.1 and CMake are downloaded by Gradle on the first native build (license already accepted).           |
| Google Chrome | 156                                   | Only for the headless browser check.                                                                        |

## Setup

```sh
corepack enable pnpm   # once per machine: puts the pinned pnpm on PATH (undo: corepack disable pnpm)
pnpm install
pnpm env:init          # copies each .env.example to .env (never overwrites)
```

Without `corepack enable`, prefix commands with `corepack`, e.g. `corepack pnpm install`.

## Run

| Command                               | What                                          | Port |
| ------------------------------------- | --------------------------------------------- | ---- |
| `pnpm student`                        | Metro for the student app (press `a` / `i`)   | 8081 |
| `pnpm student:android`                | …and open it in Expo Go on a running emulator | 8081 |
| `pnpm student:ios`                    | …and open it in Expo Go on an iOS simulator   | 8081 |
| `pnpm till`                           | Metro for the till app                        | 8082 |
| `pnpm till:android` / `pnpm till:ios` | as above, for the till                        | 8082 |
| `pnpm dashboard`                      | Vite dev server                               | 5173 |
| `pnpm dashboard:build`                | Production build to `apps/dashboard/dist`     | n/a  |
| `pnpm dashboard:preview`              | Serve the production build                    | 4173 |

Both Metro servers can run at the same time, and the apps have distinct native IDs
(`dev.omerarslan.mensa.student`, `dev.omerarslan.mensa.till`), so their builds install side by side.

**Expo Go and SDK 54:** Expo CLI installs the matching Expo Go (54) on simulators and emulators
automatically. The App Store's Expo Go on a physical iPhone only supports the newest SDK (58), so a
physical iPhone needs a development build (see _Manual steps_). On a physical Android phone, use the
standalone APK, or install Expo Go 54 from expo.dev/go.

## Checks

```sh
pnpm check            # Prettier check, ESLint (type-aware), typecheck (all 6 workspaces), unit tests, dashboard build
pnpm bundle:native    # Metro + Hermes bundles for iOS and Android, both apps (no native compile)
pnpm api:spec-diff    # opt-in, network: live OpenAPI vs committed copy (read-only)
ZAHLN_SMOKE_PASSWORD=<seeded password> pnpm api:smoke   # opt-in, network: see below
```

`pnpm api:smoke` sends only `GET /config`, `POST /sessions` (one seeded account), `GET /mensas` (with
and without a token) and CORS preflights. It never creates orders, payments or refunds, keeps the
token in memory and prints no token, password or user data. The seeded password is listed in the
OpenAPI description's "Seeded logins" table; keep it out of committed files.

## Android standalone APK

```sh
pnpm apk:student                       # armeabi-v7a + arm64-v8a (covers low-end phones with 32-bit userspace)
ANDROID_ABIS=arm64-v8a pnpm apk:student  # faster, emulator/modern-phone only
adb install -r artifacts/android/mensa-student-0.1.0-<abis>.apk
```

The script runs `expo prebuild` (regenerating the git-ignored `android/` folder) and
`gradlew assembleRelease`. The JavaScript is compiled to Hermes bytecode inside the APK, so it runs
without Metro. Limitations: it is signed with the generated **debug keystore** (installable, but not a
Play Store build and not updatable by a differently signed build), it is a foundation shell, and the app
version is 0.1.0 while the server's `minAppVersion` is 1.0.0 (payments would be refused with 426 until
the version is raised). EAS Build is the alternative route; it needs an Expo account and was not used.

## Configuration and what is public

| File                                  | Variables                                              | Visibility                                                                |
| ------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `apps/student/.env`, `apps/till/.env` | `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_CANDIDATE_ID` | **Public**: inlined into the app bundle (verified in the Hermes bytecode) |
| `apps/dashboard/.env`                 | `VITE_API_BASE_URL`, `VITE_CANDIDATE_ID`               | **Public**: inlined into the web bundle                                   |
| `.env` (root)                         | `ZAHLN_*` for the smoke check                          | Local scripts only, never bundled                                         |

The candidate ID is a data namespace sent on every request, not a credential. Client builds cannot
keep secrets, so no secret, token or password belongs in any of these files. Bearer tokens are held in
memory only. `.env` files, signing material and generated native projects are git-ignored.

## Repository layout

```
apps/student      Expo app, phone (React Navigation native stack)        entry: index.ts → src/App.tsx
apps/till         Expo app, tablet-first                                 entry: index.ts → src/App.tsx
apps/dashboard    React + Vite web app                                   entry: src/main.tsx → src/App.tsx
packages/api      contract copy, generated types, transport, smoke check  src/transport.ts, scripts/smoke.ts
packages/domain   platform-neutral payment domain (stage 1: version rule) src/versioning.ts
packages/shared   i18n, formatting, design tokens, Tailwind preset        src/index.ts, tailwind-preset.cjs
scripts/          env-init, standalone APK build
docs/             architecture, API notes, progress record, review guide
```

More: [docs/architecture.md](docs/architecture.md) · [docs/api-notes.md](docs/api-notes.md) ·
[docs/review-guide.md](docs/review-guide.md)

## Technology choices

| Choice                                                  | Why                                                                                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo SDK 54, React Native 0.81.5, React 19.1.0          | Newest stable SDK this Mac's Xcode 26.1.1 can build for iOS; still patched (54.0.38). Upgrade path to SDK 58 needs Xcode 26.4+ and Node 22.13+/24.   |
| pnpm 10 workspaces, isolated layout                     | Stops packages from using undeclared dependencies. Expo supports isolated installs from SDK 54. No Turborepo/Nx: not needed at this size.            |
| NativeWind 4.2.7 + Tailwind 3.4.19 everywhere           | NativeWind's stable line requires Tailwind 3; using Tailwind 3 on the web too lets one preset carry the design tokens to all three apps.             |
| Vite 8 + React 19.1.0 for the dashboard                 | React pinned to the Expo version, so one React instance exists in the workspace.                                                                     |
| openapi-typescript 7                                    | Types generated from the contract; the transport itself is hand-written (~100 lines) to keep retry/idempotency semantics explicit.                   |
| TypeScript 5.9, ESLint 9 (flat, type-aware), Prettier 3 | TypeScript 7 is not supported by typescript-eslint yet; ESLint 10 excludes Node 23 (ESLint 9 is deprecated upstream: upgrade together with Node 24). |
| `node:test` via tsx                                     | Platform-neutral logic is tested without a Jest/Babel setup.                                                                                         |

## Known blockers and limitations

- **No payment flow yet** (by design for stage 1).
- `minAppVersion` on the server is `1.0.0`; the apps are `0.1.0`. Raise the version before payments.
- `qrPayload` format is not specified and not yet observed (needs a cashier `POST /orders`, out of scope here).
- iPhone (physical): App Store Expo Go cannot open SDK 54 projects; a development build needs Apple
  signing in Xcode (manual).
- No Android tablet AVD exists (no Android Studio / `avdmanager` installed). The till's tablet layout
  was verified on the iPad simulator and on the phone emulator with tablet screen metrics.
- Only the `arm64-v8a` student APK has been built and installed so far; the dual-ABI review APK and
  the till APK have not been built yet.
- Disk: about 6 GB free after the first Android build. Native builds (NDK, Gradle caches,
  simulators) are tight.
- Dashboard deployment, CI, crash reporting: later stages.

## Manual steps on this Mac

See [docs/progress.md](docs/progress.md#manual-steps) for the current, precise list.

## AI tools

Claude Code (Anthropic) in VS Code, model Claude Opus 5.5, was used in stage 1 to read the brief and
the contract, check version compatibility against primary sources, scaffold the monorepo, write the
code, tests, scripts and documentation, and run the verification recorded in `docs/progress.md`.
Update this section as later stages use AI tools.
