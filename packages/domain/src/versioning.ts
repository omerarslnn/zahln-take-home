/** A server resource whose `version` only ever grows (orders and payments). */
export interface Versioned {
  id: string;
  version: number;
}

/**
 * Chooses which copy of a resource to keep when a response arrives.
 *
 * The API can answer a GET with an earlier state, and responses can arrive out of order, so a lower
 * version must never replace a higher one. An equal version keeps `current` (same state, no re-render).
 * Mixing two different resources is a programming error and throws rather than showing the wrong one.
 */
export function newerOf<T extends Versioned>(current: T | undefined, incoming: T): T {
  if (current === undefined) return incoming;
  if (current.id !== incoming.id) {
    throw new Error(`newerOf compared different resources: ${current.id} and ${incoming.id}`);
  }
  return incoming.version > current.version ? incoming : current;
}
