import { createApiClient, createTransport, monotonicNow, parsePublicApiConfig } from '@mensa/api';
import { ServerClock } from '@mensa/domain';
import Constants from 'expo-constants';

// EXPO_PUBLIC_* values are inlined into the JS bundle at build time: public, never secrets.
// Expo only inlines literal `process.env.EXPO_PUBLIC_…` expressions, so do not destructure them.
const apiConfig = parsePublicApiConfig({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  candidateId: process.env.EXPO_PUBLIC_CANDIDATE_ID,
});

/**
 * The password of the mock's seeded test accounts, published in the API description. It is in the
 * bundle on purpose, for the one-tap demo accounts only; typed sign-in does not need it. Mock-
 * specific; a real app would never ship a password. Only `PaymentServices` reads it; components,
 * logs and saved records never see it.
 */
export const seededPassword = process.env.EXPO_PUBLIC_SEEDED_PASSWORD ?? '';

/**
 * This build's release version: `expo.version` in app.json, the value that also becomes Android's
 * versionName and iOS's CFBundleShortVersionString. Sent as X-App-Version on every request; the API
 * refuses payments from versions below its `minAppVersion` (currently 1.0.0).
 */
export const appVersion = Constants.expoConfig?.version;

/** Server time learned from every response's Date header; expiry and replay decisions use it. */
export const serverClock = new ServerClock(monotonicNow);

export const candidateId = apiConfig.ok ? apiConfig.config.candidateId : null;

/** Null when the build is missing its public configuration; the UI then says what is missing. */
export const apiClient = apiConfig.ok
  ? createApiClient(
      createTransport({
        ...apiConfig.config,
        appVersion,
        onServerDate: (sample) => serverClock.observe(sample),
      }),
    )
  : null;

const ENV_NAMES = {
  baseUrl: 'EXPO_PUBLIC_API_BASE_URL',
  candidateId: 'EXPO_PUBLIC_CANDIDATE_ID',
} as const;
/** Settings without which nothing can sign in. */
export const missingApiEnvNames = apiConfig.ok
  ? []
  : apiConfig.missing.map((key) => ENV_NAMES[key]);
/** Without the published demo password only the demo accounts are unavailable. */
export const missingEnvNames = [
  ...missingApiEnvNames,
  ...(seededPassword ? [] : ['EXPO_PUBLIC_SEEDED_PASSWORD']),
];
