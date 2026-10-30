import { createApiClient, createTransport, parsePublicApiConfig } from '@mensa/api';
import Constants from 'expo-constants';

// EXPO_PUBLIC_* values are inlined into the JS bundle at build time: public, never secrets.
// Expo only inlines literal `process.env.EXPO_PUBLIC_…` expressions, so do not destructure them.
const apiConfig = parsePublicApiConfig({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  candidateId: process.env.EXPO_PUBLIC_CANDIDATE_ID,
});

/** Null when the build is missing its public configuration; the UI then says what is missing. */
export const apiClient = apiConfig.ok
  ? createApiClient(
      createTransport({ ...apiConfig.config, appVersion: Constants.expoConfig?.version }),
    )
  : null;

const ENV_NAMES = {
  baseUrl: 'EXPO_PUBLIC_API_BASE_URL',
  candidateId: 'EXPO_PUBLIC_CANDIDATE_ID',
} as const;
export const missingEnvNames = apiConfig.ok ? [] : apiConfig.missing.map((key) => ENV_NAMES[key]);
