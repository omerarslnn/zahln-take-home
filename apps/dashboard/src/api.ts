import { createApiClient, createTransport, monotonicNow, parsePublicApiConfig } from '@mensa/api';
import { ServerClock } from '@mensa/domain';

// VITE_* values are inlined into the bundle at build time: public by design, never secrets.
const apiConfig = parsePublicApiConfig({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  candidateId: import.meta.env.VITE_CANDIDATE_ID,
});

/**
 * The server's clock, from the Date header of every response. "Today" for the daily report is the
 * Berlin calendar day by this clock, so a browser with a wrong clock still opens the right day.
 */
export const serverClock = new ServerClock(monotonicNow);

/** Null when the build is missing its public configuration; the UI then says what is missing. */
export const apiClient = apiConfig.ok
  ? createApiClient(
      createTransport({
        ...apiConfig.config,
        onServerDate: (sample) => serverClock.observe(sample),
      }),
    )
  : null;

export const candidateId = apiConfig.ok ? apiConfig.config.candidateId : null;

/**
 * The seeded finance login of the mock API. Its password is the published test password ("All
 * passwords are test1234" in the API description), set at build time as VITE_SEEDED_PASSWORD:
 * public demo data inlined into the bundle, like every VITE_* value. It stays in memory so the
 * session can log in again when the 5-minute token ends. A production dashboard would use the
 * organisation's own sign-in and ship no password.
 */
export const FINANCE_USERNAME = 'finance';
export const seededPassword = import.meta.env.VITE_SEEDED_PASSWORD?.trim() || null;

const API_ENV_NAMES = { baseUrl: 'VITE_API_BASE_URL', candidateId: 'VITE_CANDIDATE_ID' } as const;
/** Missing values for reaching the API at all (the connection check needs only these). */
export const missingApiEnvNames = apiConfig.ok
  ? []
  : apiConfig.missing.map((key) => API_ENV_NAMES[key]);
/** Missing values for signing in. */
export const missingEnvNames = [
  ...missingApiEnvNames,
  ...(seededPassword ? [] : ['VITE_SEEDED_PASSWORD']),
];
