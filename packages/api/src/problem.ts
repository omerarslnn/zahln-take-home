import type { Problem } from './types';

/**
 * Runtime check for the API's `application/problem+json` error body.
 * Callers branch on `code` (stable) and `retryable`, never on `title`.
 */
export function isProblem(value: unknown): value is Problem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'number' &&
    typeof candidate.retryable === 'boolean'
  );
}
