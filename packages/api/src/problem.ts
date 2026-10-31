import type { Problem } from './types';

/**
 * Validates an `application/problem+json` error body. Callers branch on `code` (stable) and
 * `retryable`, never on `title`. `detail` is optional in the contract with a default of null, so a
 * missing one becomes null here and the value matches its generated type exactly.
 */
export function toProblem(value: unknown): Problem | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const { code, title, status, retryable, detail } = candidate;
  if (
    typeof code !== 'string' ||
    typeof title !== 'string' ||
    typeof status !== 'number' ||
    typeof retryable !== 'boolean'
  ) {
    return null;
  }
  return { code, title, status, retryable, detail: typeof detail === 'string' ? detail : null };
}
