import { createApiClient, createTransport, parsePublicApiConfig } from '@mensa/api';
import Constants from 'expo-constants';

// EXPO_PUBLIC_* values are inlined into the JS bundle at build time: public, never secrets.
// Expo only inlines literal `process.env.EXPO_PUBLIC_…` expressions, so do not destructure them.
const apiConfig = parsePublicApiConfig({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  candidateId: process.env.EXPO_PUBLIC_CANDIDATE_ID,
});

/**
 * This build's release version: `expo.version` in app.json, the value that also becomes Android's
 * versionName and iOS's CFBundleShortVersionString. Sent as X-App-Version on every request; the API
 * refuses payments from versions below its `minAppVersion` (currently 1.0.0).
 */
export const appVersion = Constants.expoConfig?.version;

/** Null when the build is missing its public configuration; the UI then says what is missing. */
export const apiClient = apiConfig.ok
  ? createApiClient(createTransport({ ...apiConfig.config, appVersion }))
  : null;

const ENV_NAMES = {
  baseUrl: 'EXPO_PUBLIC_API_BASE_URL',
  candidateId: 'EXPO_PUBLIC_CANDIDATE_ID',
} as const;
export const missingEnvNames = apiConfig.ok ? [] : apiConfig.missing.map((key) => ENV_NAMES[key]);
