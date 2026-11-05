# Mensa Lunch Rush: ZAHLN frontend take-home

One mensa payment flow across three surfaces in one TypeScript monorepo, built against the supplied,
deliberately unreliable mock API (`https://dev.zahln.de`):

- **Student app** (Expo, iOS and Android): sign in, scan the till's QR code (or type its code), see
  the mensa, the items and the amount **the server prices for this payer**, confirm with
  fingerprint, Face ID or the device PIN, and see only the server's result; payment history,
  including payments still being checked, with a detail view and refunds.
- **Till** (Expo, tablet first): ring up an order from the menu, show its QR code with a server-time
  countdown, follow it to paid or expired, and refund in full or in part with an explicit
  confirmation and a clear refusal when refunding is not allowed.
- **Finance dashboard** (React + Vite, web): Berlin daily totals per mensa and till, payments that
  need attention, search and filters with the full history of each payment, and **Export CSV** on
  the Payments page: every payment matching the applied filters, read across all pages.

German and English on every screen. **Money never moves twice and no screen shows an untrue
result**: every write is a saved intent with one idempotency key, a timeout is "not known yet"
(never "declined"), and only the server's `confirmed` is shown as paid. How: [docs/design.md](docs/design.md).

## Deliverables

| What                     | Where                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard (public URL)   | **https://zahln-mensa-dashboard-4ft.pages.dev/**: "Sign in with the finance account"                                                                                            |
| Android student app      | `mensa-student-1.0.0-7-armeabi-v7a+arm64-v8a-4fe08aa.apk`, build 7, SHA-256 `b492f1ba…05f36f8`                                                                                  |
| Android till app         | `mensa-till-1.0.0-6-armeabi-v7a+arm64-v8a-4fe08aa.apk`, build 6, SHA-256 `d16f7169…3cfb248`                                                                                     |
| iOS (student, till)      | Built from source onto a device (Expo development builds; no TestFlight)                                                                                                        |
| Source, full history     | This private repository, `main`                                                                                                                                                 |
| Design document          | [docs/design.md](docs/design.md): architecture, state machines, failures, sessions, security, kill switch, release strategy, technology choices, API changes, what was left out |
| Walkthrough for the call | [docs/review-guide.md](docs/review-guide.md)                                                                                                                                    |

The APKs are attached to the release **"Mensa Lunch Rush 1.0.0"** of this repository (tag
`v1.0.0-final`, under _Releases_; a draft until the owner publishes it) with a `SHA256SUMS.txt`; they are also built locally into
`artifacts/android/` (git-ignored). Both are **release builds signed with the project's debug key**:
installable, and updatable over the earlier builds of this repository, but **not Play Store
builds** (see [docs/design.md](docs/design.md), section 7).

## Try it

**Test accounts** (the mock API's public demo accounts; the published password for all of them is
`test1234`):

| Account                                                                   | Role    | Use in                                                         |
| ------------------------------------------------------------------------- | ------- | -------------------------------------------------------------- |
| `student`, `staff`, `guest`                                               | payer   | Student app (each pays its own price group for the same order) |
| `cashier-campus-1` … `-3`, `cashier-nord-1`, `-2`, `cashier-bibliothek-1` | cashier | Till                                                           |
| `finance`                                                                 | finance | Dashboard (one button)                                         |

Each app shows one-tap demo accounts and also accepts a typed username and password. The student app
accepts only payers and the till only cashiers; any other account is refused before it appears.
There is no registration or password reset: the API cannot create users.

**A payment end to end** (two Android devices, or the till on an iPad):

1. Till: sign in as Cashier 1, add dishes, "Create order and show QR code".
2. Student: sign in as Student, "Scan to pay", point the camera at the till (or type the order code
   shown under the QR code), check the amount, "Pay €…", confirm with fingerprint or PIN.
3. Both show "being checked", then "Paid" with the same amount and price group.
4. Till: "Payments and refunds" → the payment → refund an amount → confirm. The student's history
   shows the refund.

**A CSV export** (dashboard): Payments → set filters → "Apply filters" → **Export CSV** (top right,
next to the heading). The panel under the heading shows the progress with "Cancel export". A quick
export downloads at once; a longer one ends with "Export ready" and a **Save CSV file** button,
because browsers may hold back a download a page starts by itself long after the click. The file
holds every matching payment across all pages, in integer cents, with a byte-order mark for
spreadsheets and formula-like text neutralised.

### Install the Android apps

Download both APKs and `SHA256SUMS.txt` from the release (or use `artifacts/android/` after
building them), check them with `shasum -a 256 -c SHA256SUMS.txt`, then:

```sh
adb devices -l                                   # the phone, with USB debugging on
adb -s <serial> install -r mensa-student-1.0.0-7-armeabi-v7a+arm64-v8a-4fe08aa.apk
adb -s <serial> install -r mensa-till-1.0.0-6-armeabi-v7a+arm64-v8a-4fe08aa.apk
```

`install -r` installs over an earlier build of this repository and keeps its data (payment records
included). Both APKs contain 32- and 64-bit ARM code (any phone from Android 7.0, API 24). Paying
needs a screen lock (PIN, pattern or fingerprint). No Metro or computer is needed once installed.

## Run from source

| Tool        | Version                      | Notes                                                                                  |
| ----------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| Node.js     | 24.22.2, pinned              | pnpm downloads it on install and runs every script with it (`pnpm toolchain` shows it) |
| pnpm        | 10.34.9 via Corepack         | Pinned in `package.json#packageManager`                                                |
| Xcode       | 26.6 (built with 26.1.1 too) | For iOS builds; Expo SDK 54 is pinned on purpose (see _Technology choices_)            |
| JDK         | 17                           | For Android builds; `pnpm apk:*` passes it to Gradle explicitly                        |
| Android SDK | platform 36                  | NDK and CMake download on the first native build                                       |
| Chrome      | any recent                   | Only for the dashboard browser check                                                   |

```sh
corepack enable pnpm   # once per machine (undo: corepack disable pnpm)
pnpm install           # also downloads the pinned Node.js for project scripts
pnpm env:init          # copies each .env.example to .env (never overwrites)
```

Then set the published test password `test1234` as `EXPO_PUBLIC_SEEDED_PASSWORD` in
`apps/student/.env` and `apps/till/.env`, and as `VITE_SEEDED_PASSWORD` in `apps/dashboard/.env`.
It is public demo data, inlined into the builds for the one-tap demo accounts.

| Command                              | What                                                              | Port |
| ------------------------------------ | ----------------------------------------------------------------- | ---- |
| `pnpm student`                       | Metro for the student app                                         | 8081 |
| `pnpm till`                          | Metro for the till (its development build; press `s` for Expo Go) | 8082 |
| `pnpm dashboard`                     | Vite dev server                                                   | 5173 |
| `pnpm dashboard:build` / `:preview`  | Production build to `apps/dashboard/dist` / serve it              | 4173 |
| `pnpm apk:student` / `pnpm apk:till` | Release APKs into `artifacts/android/`                            | —    |

**iOS devices** (Mac and device on the same network; the Apple team you choose stays in the
git-ignored `apps/*/ios` projects):

```sh
# Student on an iPhone (Face ID needs a native build; Expo Go cannot use it)
pnpm --filter @mensa/student exec expo run:ios --device          # builds and installs; then:
pnpm student                                                     # Metro 8081 for later JavaScript changes
# Till on an iPad
pnpm --filter @mensa/till exec expo run:ios --device --port 8082 # builds and installs; then:
pnpm till                                                        # Metro 8082
```

A native rebuild (`expo run:ios --device`) is needed after a change to `app.json`, a native module
or a build number; a JavaScript change needs only Metro (reload the app; add `--clear` after a
dependency change). If Expo CLI writes `ios.appleTeamId` into an `app.json`, do not commit it.

## Verification

Results as of 2026-11-05 (details and earlier rounds: [docs/progress.md](docs/progress.md)).

| Kind                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated                           | `pnpm check` passes: formatting, type-aware lint, types in 6 workspaces, **282 tests** (domain rules against a simulated server that loses responses, times out, refuses and replays), single React/NativeWind instances, identical shared native files, dashboard build                                                                                                                                                                                                                                                                           |
| Dashboard, deployed URL             | `pnpm dashboard:browser-check` **44/44** on https://zahln-mensa-dashboard-4ft.pages.dev/: figures equal to the API, filters, paging, German, phone width, deep links, sign-out, CORS, a keyboard-only pass with focus indicators, and the CSV export through its visible button: a quick export saved at once, a long one offered with "Save CSV file", the full file equal to an independent traversal, cancellation, a filter change and a failed page (no file). A downloaded file parses as CSV: 19 columns, every row complete, integer cents |
| Android release builds (emulator)   | Student 7 installs over build 6 keeping its data, starts without Metro, signs in, history and refunds; till 6 likewise over build 5; manifests, permissions, signing and the absence of development code checked                                                                                                                                                                                                                                                                                                                                   |
| iOS                                 | Release builds of both apps for the iOS simulator from a fresh prebuild: built, installed and started (English and German, Face ID and camera texts in the bundle); device builds are development builds from source                                                                                                                                                                                                                                                                                                                               |
| Physical devices (run by the owner) | Pixel XL (Android 10), iPad A16, iPhone 17 Pro: payments with fingerprint and Face ID, cancelled authorization, refunds, expiry, offline recovery, German, larger text, keyboard, and **TalkBack and VoiceOver** on the pay flow and the till                                                                                                                                                                                                                                                                                                      |
| Not run on a device                 | A real lost response and a force-stop with an unresolved payment (both covered by simulated-server tests; the matrix in `docs/manual-tests.md` has safe device versions)                                                                                                                                                                                                                                                                                                                                                                           |

## What was deliberately not built

- **No offline payment queue and no background retry**: a queued or automatic write can move money
  the user no longer expects. Every write needs a tap.
- **No order cancellation** (the API has no endpoint), **no sign-up, password reset or price-group
  choice** (the API has none, and prices must come from the server).
- **No crash reporting, analytics or CI**: no backend or consent flow in scope; `pnpm check` runs
  the gates locally. Production would add all three ([docs/design.md](docs/design.md), section 7).
- **No store-signed builds**: they need Play and App Store accounts; the APKs are debug-key signed.

## Known limitations

- **Local authorization is a device-side gate.** The mock API cannot verify a fingerprint, Face ID
  or PIN; only the bearer token authorizes a payment. Production needs server-verifiable approval.
- **No lookup by idempotency key.** A lost response can be settled only by resending the same key
  within the server's 24-hour retention (the app stops at 23 hours of server time). After that, an
  unknown payment stays "not known", and an unknown refund keeps blocking another refund of that
  payment, on purpose.
- **Mock sessions.** Tokens last five minutes with no refresh token, so the apps keep the signed-in
  account's password in memory (never on disk) to sign in again; the dashboard keeps nothing, so a
  reload asks to sign in again.
- **Reports and exports have no version or snapshot**: "last fetched" is when a copy arrived; an
  export is a complete traversal of one cursor chain, not an atomic accounting extract.
- **iOS** builds are development builds from source; an iOS language change restarts the app (iOS
  does this itself).
- No Android tablet was available: the till's tablet layout was checked on an emulator and on the
  iPad.

## Configuration and what is public

| File                                  | Variables                                                                             | Visibility                        |
| ------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| `apps/student/.env`, `apps/till/.env` | `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_CANDIDATE_ID`, `EXPO_PUBLIC_SEEDED_PASSWORD` | **Public**: inlined into the apps |
| `apps/dashboard/.env`                 | `VITE_API_BASE_URL`, `VITE_CANDIDATE_ID`, `VITE_SEEDED_PASSWORD`                      | **Public**: inlined into the site |
| `.env` (root)                         | `ZAHLN_*` for the opt-in API scripts                                                  | Local only                        |

The candidate ID is a data namespace sent on every request, not a credential. Client builds cannot
keep secrets, so none are in them. Bearer tokens live in memory only; saved payment records (Expo
SecureStore) hold IDs, amounts and states, never a token, password or name. `.env` files, signing
material, generated native projects, `artifacts/` and `.local/` are git-ignored.

## Checks and scripts

```sh
pnpm check                      # everything that gates a commit (see Verification)
pnpm bundle:native              # Metro + Hermes bundles for iOS and Android, both apps
pnpm dashboard:browser-check [-- --url <URL>] [--idle]   # read-only, network: the dashboard in headless Chrome
pnpm api:smoke | api:spec-diff  # opt-in, network, read-only: live API and spec comparison
pnpm api:order-probe | api:payment-probe   # opt-in, network, WRITE one order (and payment); see docs/api-notes.md
```

Every live write made during development is listed in
[docs/api-notes.md](docs/api-notes.md#live-writes-ledger).

## Dashboard deployment

Cloudflare Pages project `zahln-mensa-dashboard`, production branch `main`, by direct upload of a
local build; the served files are byte-identical to a build of `6ff2308`, the redesigned dashboard
(checked 2026-11-05).
Routes live after `#`, so deep links and reloads need no rewrite rules; the API allows any origin.

```sh
pnpm dashboard:build
pnpm dlx wrangler@4.151.1 pages deploy apps/dashboard/dist --project-name zahln-mensa-dashboard --branch main
pnpm dashboard:browser-check -- --url https://zahln-mensa-dashboard-4ft.pages.dev/
```

## Repository layout

```
apps/student      Expo app, phone                     entry: index.ts → src/App.tsx
apps/till         Expo app, tablet first              entry: index.ts → src/App.tsx
apps/dashboard    React + Vite web app                entry: src/main.tsx → src/App.tsx
packages/api      contract copy, generated types, transport, client and decoders
packages/domain   payment rules: intents, sessions, server clock, gate, versions; /finance for the dashboard
packages/shared   German and English texts, money and Berlin-time formatting, design tokens
scripts/          env setup, APK build, single-instance and shared-copy checks, dashboard browser check
docs/             design, architecture, design system, API notes, progress record, manual tests, review guide
```

## Technology choices

| Choice                                                                                                      | Why                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Expo SDK 54, React Native 0.81.5, React 19.1.0                                                              | The newest SDK the Mac's Xcode (then 26.1.1) could build when the project started; still patched; kept pinned through the review        |
| pnpm 10 workspaces, isolated layout                                                                         | Undeclared dependencies fail early; no Turborepo/Nx needed at this size                                                                 |
| Platform-neutral `@mensa/domain`, `node:test` via tsx                                                       | The money rules are tested against a simulated server, without a device or a UI framework                                               |
| NativeWind 4 + Tailwind 3 everywhere                                                                        | One token preset for phone, till and web                                                                                                |
| Vite + React 19.1.0, hash routes, no router or UI kit                                                       | Five screens; deep links survive any static host                                                                                        |
| openapi-typescript 7 + hand-written transport/decoders                                                      | Types from the contract; retry and validation semantics explicit                                                                        |
| expo-camera, expo-local-authentication, expo-secure-store, expo-network, expo-localization, expo-keep-awake | SDK 54's own modules for scanning, local authorization, saved intents, connectivity hints, the device language and the till's QR screen |
| qrcode 1.5.4, drawn with plain Views                                                                        | Mature encoder; `react-native-svg` duplicated NativeWind's runtime                                                                      |

## AI tools

- **ChatGPT (OpenAI)**: task analysis, prompt preparation and read-only source review.
- **Claude Code (Anthropic)** in VS Code, model Claude Opus 5.5: implementation (code, tests,
  scripts and documentation) and the executed verification recorded in `docs/progress.md`, from the
  foundations to the final release preparation. The physical-device checks were run by the author.
