// Minimal runtime validation ("decoders") for API responses, without a schema library: each decoder
// either returns a value of its type or throws a DecodeError naming the path. Error messages carry
// paths and expectations only, never response values, so they are safe to show or report.
import { parseTimestamp } from './timestamp';

export class DecodeError extends Error {
  constructor(
    readonly path: string,
    readonly expected: string,
  ) {
    super(`${path}: expected ${expected}`);
    this.name = 'DecodeError';
  }
}

export type Decoder<T> = (input: unknown, path: string) => T;

/** One decoder per field of T; used to type field maps that are shared between object decoders. */
export type Fields<T> = { [K in keyof T]-?: Decoder<T[K]> };

export const string: Decoder<string> = (input, path) => {
  if (typeof input !== 'string') throw new DecodeError(path, 'string');
  return input;
};

export const nonEmptyString: Decoder<string> = (input, path) => {
  const value = string(input, path);
  if (value === '') throw new DecodeError(path, 'non-empty string');
  return value;
};

export const boolean: Decoder<boolean> = (input, path) => {
  if (typeof input !== 'boolean') throw new DecodeError(path, 'boolean');
  return input;
};

/** A whole number in the safe integer range. */
export const integer: Decoder<number> = (input, path) => {
  if (typeof input !== 'number' || !Number.isSafeInteger(input)) {
    throw new DecodeError(path, 'integer');
  }
  return input;
};

export const nonNegativeInteger: Decoder<number> = (input, path) => {
  const value = integer(input, path);
  if (value < 0) throw new DecodeError(path, 'integer ≥ 0');
  return value;
};

export const positiveInteger: Decoder<number> = (input, path) => {
  const value = integer(input, path);
  if (value < 1) throw new DecodeError(path, 'integer ≥ 1');
  return value;
};

/**
 * Money is integer euro cents. Most amounts are never negative (and zero is legitimate, e.g. nothing
 * left to refund); only report net totals may go below zero, so they use `signedCents`.
 */
export const cents: Decoder<number> = nonNegativeInteger;
export const signedCents: Decoder<number> = integer;

/** ISO 8601 timestamp with an offset; kept as the original string once it is known to parse. */
export const timestamp: Decoder<string> = (input, path) => {
  const value = string(input, path);
  if (parseTimestamp(value) === null) throw new DecodeError(path, 'ISO 8601 timestamp');
  return value;
};

export function literal<const T extends string>(expected: T): Decoder<T> {
  return (input, path) => {
    if (input !== expected) throw new DecodeError(path, JSON.stringify(expected));
    return expected;
  };
}

export function oneOf<const T extends readonly string[]>(values: T): Decoder<T[number]> {
  return (input, path) => {
    if (typeof input !== 'string' || !values.includes(input)) {
      throw new DecodeError(path, `one of ${values.join(', ')}`);
    }
    return input;
  };
}

/** Accepts `null` (a field the server sends empty), otherwise the inner decoder. */
export function nullable<T>(decoder: Decoder<T>): Decoder<T | null> {
  return (input, path) => (input === null ? null : decoder(input, path));
}

/** Accepts a missing field. Role-specific fields (cashier-only, payer-only) use this. */
export function optional<T>(decoder: Decoder<T>): Decoder<T | undefined> {
  return (input, path) => (input === undefined ? undefined : decoder(input, path));
}

/**
 * A field the contract marks optional but with a default (e.g. `currency`, default "EUR"); the
 * generated type makes it required, so a missing value becomes the documented default.
 */
export function withDefault<T>(decoder: Decoder<T>, fallback: T): Decoder<T> {
  return (input, path) => (input === undefined ? fallback : decoder(input, path));
}

export function array<T>(item: Decoder<T>): Decoder<T[]> {
  return (input, path) => {
    if (!Array.isArray(input)) throw new DecodeError(path, 'array');
    return input.map((element, index) => item(element, `${path}[${index}]`));
  };
}

/**
 * Decodes an object field by field. The field map is typed against the generated contract type,
 * so a decoder that forgets a field or gets its type wrong fails the typecheck. Unknown extra fields
 * are dropped: the client keeps only what it has validated.
 */
export function object<T>(fields: Fields<T>): Decoder<T> {
  return (input, path) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new DecodeError(path, 'object');
    }
    const source = input as Record<string, unknown>;
    const result: Partial<T> = {};
    for (const key of Object.keys(fields) as (keyof T & string)[]) {
      const value = fields[key](source[key], `${path}.${key}`);
      if (value !== undefined) result[key] = value;
    }
    return result as T;
  };
}

/** Runs a decoder without throwing. */
export function decode<T>(
  decoder: Decoder<T>,
  input: unknown,
  root: string,
): { ok: true; value: T } | { ok: false; error: DecodeError } {
  try {
    return { ok: true, value: decoder(input, root) };
  } catch (error) {
    if (error instanceof DecodeError) return { ok: false, error };
    throw error;
  }
}
