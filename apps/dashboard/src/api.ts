import { createApiClient, createTransport, parsePublicApiConfig } from '@mensa/api';

// VITE_* values are inlined into the bundle at build time: public by design, never secrets.
const apiConfig = parsePublicApiConfig({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  candidateId: import.meta.env.VITE_CANDIDATE_ID,
});

/** Null when the build is missing its public configuration; the UI then says what is missing. */
export const apiClient = apiConfig.ok ? createApiClient(createTransport(apiConfig.config)) : null;

const ENV_NAMES = { baseUrl: 'VITE_API_BASE_URL', candidateId: 'VITE_CANDIDATE_ID' } as const;
export const missingEnvNames = apiConfig.ok ? [] : apiConfig.missing.map((key) => ENV_NAMES[key]);
