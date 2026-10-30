# Review guide

For walking through the code and changing it live. Each recipe names the files to touch and the
command that proves the change.

## Reading order (about 10 minutes)

1. `package.json`, `pnpm-workspace.yaml`: workspace layout, pinned pnpm, every root command.
2. `packages/api/src/transport.ts`: the only HTTP entry point. Four result kinds; no retries, no logs.
3. `packages/api/src/client.ts`: typed endpoints; payment writes are deliberately missing.
4. `packages/domain/src/versioning.ts`: `newerOf`, the "never go back in version" rule.
5. `packages/shared/src/index.ts` and `tailwind-preset.cjs`: i18n, formatting, tokens.
6. `apps/student/src/App.tsx` → `navigation.tsx` → `screens/`: providers and the native stack.
7. `apps/till/src/TillScreen.tsx`: tablet layout through Tailwind's `md:` breakpoint.
8. `apps/dashboard/src/ConnectionCheck.tsx`: why a browser check proves CORS and a curl call does not.
9. `eslint.config.mjs`: the platform boundary as rules.

## Native concepts, mapped

| Here                                                            | Familiar native equivalent                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `app.json` (`ios.bundleIdentifier`, `android.package`, version) | Info.plist + Gradle `defaultConfig`                                                           |
| `expo prebuild` → git-ignored `android/` + `ios/`               | Generating the Gradle/Xcode projects from config; they are build output                       |
| Metro dev server (8081/8082)                                    | A live-reloading asset server feeding the JS VM; release builds embed Hermes bytecode instead |
| `@react-navigation/native-stack`                                | `UINavigationController` / a Fragment back stack (real native transitions)                    |
| NativeWind `className="bg-brand"`                               | Style resources; compiled to React Native style objects at build time                         |
| `tokens.json` + Tailwind preset                                 | `colors.xml` / asset-catalog colours, shared by every module                                  |
| `messages.ts` + `I18nProvider`                                  | `strings.xml` / `Localizable.strings` with an in-app language override                        |
| `TransportResult` union                                         | A Kotlin `sealed class Result` / Swift `enum` with associated values                          |
| `packages/domain`                                               | A pure Kotlin/Swift module with no Android/UIKit imports                                      |
| pnpm workspace + `exports`                                      | A multi-module Gradle build / Swift packages with a public API surface                        |
| `EXPO_PUBLIC_*` / `VITE_*`                                      | `BuildConfig` fields / Info.plist values: readable from the binary, never secrets             |
| Release APK signed with `debug.keystore`                        | A release variant signed with the debug key: installable, not publishable                     |

## Boundary rules in one breath

Apps may import packages; packages never import apps. `api` and `shared` do not know each other;
`domain` builds on `api`. Package source must run unchanged in Hermes, the browser and Node, so it
has no React Native, Expo, DOM, Node built-ins or `console`. React bindings live behind
`@mensa/shared/react`.

## Live-change recipes

**Add or change a UI string**

1. Add the key to `en` in `packages/shared/src/i18n/messages.ts`.
2. `pnpm typecheck` now fails until the same key exists in `de` (that is the point).
3. Use it: `const { t } = useI18n(); t('my.key', { name })`.

**Change a colour or add a token**

1. Edit `packages/shared/src/tokens/tokens.json` (and map it in `tailwind-preset.cjs` if it is new).
2. All three apps pick it up: `pnpm dashboard:build`, or restart Metro with `--clear`.
3. Check text contrast stays ≥ 4.5:1 (table in `docs/architecture.md`).

**Add an API endpoint (example: `GET /orders/{orderId}`)**

1. `packages/api/src/client.ts`: add
   `getOrder: (orderId, accessToken) => transport.request<Order>({ method: 'GET', path: '/orders/' + encodeURIComponent(orderId), accessToken })`
   and its signature in `ApiClient`.
2. `Order` already exists in `src/types.ts` (generated). `pnpm typecheck && pnpm test`.
3. Writes (`POST`) must not be added without the stage 2 intent store: they need a persisted
   `idempotencyKey` reused on every retry.

**Add a screen to the student app**

1. Add the route and its params to `RootStackParamList` in `apps/student/src/navigation.tsx`.
2. Add `<Stack.Screen name="…" component={…} options={{ title: t('…') }} />`.
3. Navigate with `navigation.navigate('…')`; TypeScript checks route names and params.

**Change a port or a native identifier**

- Metro ports: `start`/`android`/`ios` scripts in `apps/*/package.json` (8081, 8082).
- Dashboard ports: `apps/dashboard/vite.config.ts` (5173, 4173). The smoke check's simulated
  origins come from `ZAHLN_SMOKE_ORIGINS`.
- IDs: `ios.bundleIdentifier` / `android.package` in `apps/*/app.json`, then `pnpm apk:student`
  (prebuild regenerates `android/`).

**Point the apps at another API or candidate**

Edit `apps/*/.env` (and the root `.env` for scripts), then restart Metro with `--clear` or rebuild:
the values are inlined at build time.

**Contract change**

Replace `packages/api/openapi/openapi.json` deliberately (keep `brief/` untouched), run
`pnpm api:generate`, then `pnpm typecheck`. Note the change in `docs/api-notes.md`.

**Share a React Native component between student and till**

Today the two apps keep small identical copies (`src/components/Foundation.tsx`,
`ConnectionCheck.tsx`). To share them, create `packages/native-ui` with `react-native`, `react`,
`nativewind` and `react-native-css-interop` as peer + dev dependencies at exactly the apps' versions,
move the files, add `../../packages/native-ui/src/**/*.{ts,tsx}` to both apps' Tailwind `content`,
and confirm `node_modules/.pnpm` still holds a single `react-native@0.81.5_*` folder. A second copy,
created by a different peer set, crashes at runtime. Do not import it from the dashboard; ESLint's
package rules apply.

**Add a boundary rule (example: only `@mensa/api` may call `fetch`)**

Add `'fetch'` to `no-restricted-globals` for `apps/*/src/**` in `eslint.config.mjs`; `pnpm lint`.

## Likely questions and where the answer is

- _Why Expo SDK 54, not 58?_ This Mac's Xcode 26.1.1; SDK 55+ needs Xcode 26.2–26.4+ (README).
- _Why does the transport never retry?_ A timeout after a POST is an unknown outcome; retrying is
  only safe with the same persisted idempotency key and payload, which is the domain's job.
- _Why does `formatCents` throw on 12.5?_ Money is integer cents; a fraction means a bug upstream.
- _Why Tailwind 3 on the web?_ One token preset for NativeWind 4 (Tailwind 3 only) and the web.
- _Why do the native apps list `react-native-css-interop` and `@babel/plugin-transform-react-jsx`?_
  NativeWind relies on hoisting; pnpm's isolated layout makes those dependencies explicit
  (architecture notes, point 3). The second one only broke the Gradle release bundling.
- _Is the candidate ID a secret?_ No: a data namespace, embedded in every client build.
- _What is verified on devices?_ See the table in `docs/progress.md`; Expo Go runs are not the same as
  a standalone build, and neither proves camera or biometric behaviour.
