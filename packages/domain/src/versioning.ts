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

/**
 * Whether `incoming` is a later state of an order than `known`: a higher version, with one
 * exception observed on the live API (2026-10-31). An order turns from `open` to `expired` when its
 * time runs out WITHOUT a new version, although the contract says the version grows with every
 * change. So at an equal version `expired` replaces `open`; a stale `open` never replaces `expired`,
 * and no other equal-version change is accepted.
 */
export function isLaterOrderState(
  known: { version: number; status: string },
  incoming: { version: number; status: string },
): boolean {
  if (incoming.version !== known.version) return incoming.version > known.version;
  return known.status === 'open' && incoming.status === 'expired';
}
