export interface PublicApiConfig {
  baseUrl: string;
  candidateId: string;
}

export type PublicApiConfigResult =
  { ok: true; config: PublicApiConfig } | { ok: false; missing: ('baseUrl' | 'candidateId')[] };

/**
 * Validates the build-time settings each app reads from its env (EXPO_PUBLIC_* or VITE_*).
 * Both values are public: they are inlined into the client bundle, so no secret may ever go here.
 * Plain http is accepted only for localhost.
 */
export function parsePublicApiConfig(input: {
  baseUrl?: string | undefined;
  candidateId?: string | undefined;
}): PublicApiConfigResult {
  const baseUrl = input.baseUrl?.trim() ?? '';
  const candidateId = input.candidateId?.trim() ?? '';
  const missing: ('baseUrl' | 'candidateId')[] = [];
  if (
    !/^https:\/\/\S+$/.test(baseUrl) &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(baseUrl)
  ) {
    missing.push('baseUrl');
  }
  if (candidateId === '') missing.push('candidateId');
  return missing.length > 0
    ? { ok: false, missing }
    : { ok: true, config: { baseUrl, candidateId } };
}
