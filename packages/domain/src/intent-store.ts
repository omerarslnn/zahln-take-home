import * as d from '@mensa/api/decode';
import type {
  CreateOrderIntent,
  IntentRecord,
  PayOrderIntent,
  RefundIntent,
  Scope,
} from './intent';

export interface StoredIntents {
  records: IntentRecord[];
  /** Entries that exist but could not be read; reported, not silently dropped. */
  unreadable: number;
}

/**
 * Durable storage for intent records, one partition per scope (candidate + user). Platform
 * adapters implement it: Expo SecureStore in the apps, a JSON file in scripts, memory in tests
 * (testing/memory-intent-store.ts, deliberately not exported from the package).
 * `save` must only resolve once the record is stored: the controller sends nothing before that.
 */
export interface IntentStore {
  load(scope: Scope): Promise<StoredIntents>;
  save(record: IntentRecord): Promise<void>;
  remove(scope: Scope, key: string): Promise<void>;
}

/** Expo SecureStore warns above 2048 bytes per value; every record must fit. */
export const MAX_RECORD_BYTES = 2048;

export class IntentStorageError extends Error {
  constructor(readonly reason: 'record_too_large' | 'store_full' | 'write_failed') {
    super(`Intent storage failed: ${reason}`);
    this.name = 'IntentStorageError';
  }
}

/** Serialises a record, refusing ones that would not fit a SecureStore value. */
export function serializeIntent(record: IntentRecord): string {
  const json = JSON.stringify(record);
  if (utf8Length(json) > MAX_RECORD_BYTES) throw new IntentStorageError('record_too_large');
  return json;
}

/** Parses and validates a stored record; null if it is corrupt or belongs to another scope. */
export function parseIntent(json: string, scope: Scope): IntentRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const decoded = d.decode(record, value, 'intent');
  if (!decoded.ok) return null;
  const owner = decoded.value.scope;
  return owner.candidateId === scope.candidateId && owner.userId === scope.userId
    ? decoded.value
    : null;
}

/**
 * A storage-safe name for a scope using only [A-Za-z0-9._-] (SecureStore's key alphabet). Every
 * other character, including '_' and '.', is escaped, so two different scopes never share a name.
 */
export function scopeStorageId(scope: Scope): string {
  return `${encodePart(scope.candidateId)}.${encodePart(scope.userId)}`;
}

function encodePart(value: string): string {
  return Array.from(value, (char) =>
    /[A-Za-z0-9]/.test(char) ? char : `_${(char.codePointAt(0) ?? 0).toString(16)}_`,
  ).join('');
}

function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

// ---- record validation ------------------------------------------------------------------------

const version: d.Decoder<1> = (input, path) => {
  if (input !== 1) throw new d.DecodeError(path, 'record version 1');
  return 1;
};
const scopeDecoder = d.object<Scope>({ candidateId: d.nonEmptyString, userId: d.nonEmptyString });
const base = {
  v: version,
  key: d.nonEmptyString,
  scope: scopeDecoder,
  state: d.oneOf(['ready', 'submitting', 'unknown', 'applied', 'rejected'] as const),
  attempts: d.nonNegativeInteger,
  maybeApplied: d.boolean,
  firstSentAt: d.nullable(d.integer),
  // Added in stage 3; records saved before it have none.
  lastSentAt: d.withDefault(d.nullable(d.integer), null),
  refusal: d.nullable(d.string),
};

const createOrder = d.object<CreateOrderIntent>({
  ...base,
  kind: d.literal('createOrder'),
  payload: d.object<CreateOrderIntent['payload']>({
    items: d.array(
      d.object<CreateOrderIntent['payload']['items'][number]>({
        itemId: d.nonEmptyString,
        quantity: d.positiveInteger,
      }),
    ),
  }),
  resource: d.nullable(
    d.object<NonNullable<CreateOrderIntent['resource']>>({
      orderId: d.nonEmptyString,
      status: d.oneOf(['open', 'paying', 'paid', 'expired'] as const),
      version: d.nonNegativeInteger,
    }),
  ),
});

const payOrder = d.object<PayOrderIntent>({
  ...base,
  kind: d.literal('payOrder'),
  payload: d.object<PayOrderIntent['payload']>({
    orderId: d.nonEmptyString,
    amountCents: d.positiveInteger,
  }),
  resource: d.nullable(
    d.object<NonNullable<PayOrderIntent['resource']>>({
      paymentId: d.nonEmptyString,
      status: d.oneOf(['pending', 'confirmed', 'declined'] as const),
      version: d.nonNegativeInteger,
    }),
  ),
});

const refundPayment = d.object<RefundIntent>({
  ...base,
  kind: d.literal('refundPayment'),
  payload: d.object<RefundIntent['payload']>({
    paymentId: d.nonEmptyString,
    amountCents: d.positiveInteger,
    reason: d.nullable(d.string),
  }),
  resource: d.nullable(
    d.object<NonNullable<RefundIntent['resource']>>({
      refundId: d.nonEmptyString,
      status: d.oneOf(['pending', 'completed', 'failed'] as const),
      paymentVersion: d.nullable(d.nonNegativeInteger),
    }),
  ),
});

const record: d.Decoder<IntentRecord> = (input, path) => {
  const kind =
    typeof input === 'object' && input !== null ? (input as { kind?: unknown }).kind : null;
  if (kind === 'createOrder') return createOrder(input, path);
  if (kind === 'payOrder') return payOrder(input, path);
  if (kind === 'refundPayment') return refundPayment(input, path);
  throw new d.DecodeError(`${path}.kind`, 'intent kind');
};
