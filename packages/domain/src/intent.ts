// One intent per deliberate action (ring up an order, pay an order, refund a payment): the minimum
// needed to recover it after a lost response or an app restart. Pure data and pure transitions; the
// IntentController decides when they run and persists every state before acting on it.
import type { Order, OrderStatus, Payment, PaymentStatus, Refund, RefundStatus } from '@mensa/api';
import type { ServerTime } from './server-clock';
import { isLaterOrderState } from './versioning';
import type { AttemptOutcome } from './write-outcome';

/** Whose intent this is: the candidate namespace and the server's user ID (never a username). */
export interface Scope {
  candidateId: string;
  userId: string;
}

export type IntentKind = 'createOrder' | 'payOrder' | 'refundPayment';

/**
 * What the client knows about its own write request; the server resource has its own status.
 * - ready: saved; not sent yet, or every attempt was refused before anything happened.
 * - submitting: saved just before an attempt. Found after a restart it means "maybe sent".
 * - unknown: an attempt may have been applied and nothing has settled it yet.
 * - applied: the server returned (or a read found) the resource; `resource` has its last status.
 * - rejected: the server refused the action itself and no earlier attempt can have applied it.
 */
export type WriteState = 'ready' | 'submitting' | 'unknown' | 'applied' | 'rejected';

interface IntentBase {
  v: 1;
  /** The Idempotency-Key, also the record's identity. Never changes, never reused for another action. */
  key: string;
  scope: Scope;
  state: WriteState;
  attempts: number;
  /** Sticky: some attempt may have been applied. A later refusal never clears it. */
  maybeApplied: boolean;
  /** Server time (earliest bound) of the first attempt; anchors the server's 24 h key retention. */
  firstSentAt: number | null;
  /** Server time (latest bound) of the most recent attempt; bounds when it can have been applied. */
  lastSentAt: number | null;
  /** The last refusal code; with state 'rejected' it is the final answer. */
  refusal: string | null;
}

export interface CreateOrderIntent extends IntentBase {
  kind: 'createOrder';
  payload: { items: { itemId: string; quantity: number }[] };
  resource: { orderId: string; status: OrderStatus; version: number } | null;
}

export interface PayOrderIntent extends IntentBase {
  kind: 'payOrder';
  /** `amountCents` is the amount shown to the payer; the server refuses it if the price differs. */
  payload: { orderId: string; amountCents: number };
  resource: { paymentId: string; status: PaymentStatus; version: number } | null;
}

export interface RefundIntent extends IntentBase {
  kind: 'refundPayment';
  payload: { paymentId: string; amountCents: number; reason: string | null };
  /** Refunds carry no version; the parent payment's version orders updates when known. */
  resource: { refundId: string; status: RefundStatus; paymentVersion: number | null } | null;
}

export type IntentRecord = CreateOrderIntent | PayOrderIntent | RefundIntent;

/** The kind and payload of a new intent, correlated per kind. */
export type NewIntent = IntentRecord extends infer R
  ? R extends IntentRecord
    ? Pick<R, 'kind' | 'payload'>
    : never
  : never;

/** The server keeps idempotency keys for 24 hours per user; replays stop one hour earlier. */
export const REPLAY_WINDOW_MS = 23 * 60 * 60 * 1000;

export function newIntent(input: NewIntent, key: string, scope: Scope): IntentRecord {
  return {
    v: 1,
    key,
    scope,
    state: 'ready',
    attempts: 0,
    maybeApplied: false,
    firstSentAt: null,
    lastSentAt: null,
    refusal: null,
    resource: null,
    ...input,
  };
}

/** Marks an attempt as started; this state is saved before the request is sent. */
export function beginAttempt(record: IntentRecord, now: ServerTime): IntentRecord {
  return {
    ...record,
    state: 'submitting',
    attempts: record.attempts + 1,
    firstSentAt: record.firstSentAt ?? now.earliest,
    lastSentAt: now.latest,
  };
}

/**
 * Applies an attempt that did not return the resource. A refusal only settles the intent if no
 * earlier attempt may have been applied: otherwise "order_already_paid" or a 401 on a retry could
 * be hiding our own earlier payment, so the intent stays unknown and reads must settle it.
 */
export function afterUnapplied(
  record: IntentRecord,
  outcome: Exclude<AttemptOutcome<unknown>, { type: 'applied' }>,
): IntentRecord {
  if (record.state === 'applied' || record.state === 'rejected') return record;
  if (outcome.type !== 'refused') return { ...record, state: 'unknown', maybeApplied: true };
  if (record.maybeApplied) return { ...record, state: 'unknown', refusal: outcome.code };
  return { ...record, state: outcome.final ? 'rejected' : 'ready', refusal: outcome.code };
}

/** After a restart, an attempt that was being sent may have reached the server. */
export function recoverAfterRestart(record: IntentRecord): IntentRecord {
  return record.state === 'submitting'
    ? { ...record, state: 'unknown', maybeApplied: true }
    : record;
}

/** Records the order; the same rule as the cache, so a restart (empty cache) cannot regress it. */
export function withOrder(record: CreateOrderIntent, order: Order): CreateOrderIntent {
  if (record.resource && !isLaterOrderState(record.resource, order)) return record;
  return {
    ...record,
    state: 'applied',
    refusal: null,
    resource: { orderId: order.id, status: order.status, version: order.version },
  };
}

/** Records the payment; a lower version never replaces a higher one (e.g. confirmed → pending). */
export function withPayment(record: PayOrderIntent, payment: Payment): PayOrderIntent {
  if (record.resource && record.resource.version > payment.version) return record;
  return {
    ...record,
    state: 'applied',
    refusal: null,
    resource: { paymentId: payment.id, status: payment.status, version: payment.version },
  };
}

/** Records the refund; a finished refund (completed, failed) never moves back to pending. */
export function withRefund(
  record: RefundIntent,
  refund: Refund,
  paymentVersion: number | null,
): RefundIntent {
  const known = record.resource;
  if (known && known.status !== 'pending' && refund.status === 'pending') return record;
  if (
    known?.paymentVersion != null &&
    paymentVersion != null &&
    known.paymentVersion > paymentVersion
  ) {
    return record;
  }
  return {
    ...record,
    state: 'applied',
    refusal: null,
    resource: { refundId: refund.id, status: refund.status, paymentVersion },
  };
}

/**
 * A read showed the order `paid` with no payment ID for this payer. By the contract (a payer sees
 * their own payment on the order, only one payment can be pending, `paid` is final, and only
 * `confirmed` means paid) this attempt did not pay the order: it was declined or never applied.
 * Only that read concludes it, never a refusal on a retry.
 */
export function notChargedPaidByOther(record: PayOrderIntent): PayOrderIntent {
  return { ...record, state: 'rejected', refusal: 'order_paid_by_other' };
}

export type PaymentDisplay =
  'not_sent' | 'sending' | 'checking' | 'pending' | 'confirmed' | 'declined' | 'refused';

/**
 * What a payer may be told about a payment intent. Only a server status of `confirmed` is shown as
 * paid; `pending`, `checking` (outcome unknown) and `sending` are never success, and no timeout,
 * polling deadline or order countdown turns them into a decline.
 */
export function paymentDisplay(record: PayOrderIntent): PaymentDisplay {
  switch (record.state) {
    case 'ready':
      return 'not_sent';
    case 'submitting':
      return 'sending';
    case 'unknown':
      return 'checking';
    case 'rejected':
      return 'refused';
    case 'applied':
      return record.resource?.status === 'confirmed'
        ? 'confirmed'
        : record.resource?.status === 'declined'
          ? 'declined'
          : 'pending';
  }
}

/**
 * A known final result: the action is settled and a deliberate new one may follow. For an order this
 * means the checkout is over, not that the create request succeeded: an applied order is still being
 * paid until the server says `paid` or `expired`, so the till keeps it and starts no other.
 */
export function isFinal(record: IntentRecord): boolean {
  if (record.state === 'rejected') return true;
  if (record.state !== 'applied') return false;
  switch (record.kind) {
    case 'createOrder':
      return record.resource?.status === 'paid' || record.resource?.status === 'expired';
    case 'payOrder':
    case 'refundPayment':
      return record.resource?.status !== 'pending';
  }
}

/** "The order can be paid until `expiresAt` (5 minutes)" (POST /orders). */
export const ORDER_LIFETIME_MS = 5 * 60 * 1000;
/** Extra time for a request that reached the server late (it can outlive the client's timeout). */
const LATE_ARRIVAL_MARGIN_MS = 5 * 60 * 1000;

/**
 * Whether the till may close an order intent whose create response never arrived. Such an order,
 * if it exists at all, was never shown: its QR came only in the lost response, and order IDs cannot
 * be guessed, so nobody can have paid it. Once any order it may have created must have expired, by
 * server time from its last attempt, closing it moves no money and frees the till. An order whose
 * QR was shown (applied) never qualifies: it waits for `paid` or `expired`.
 */
export function canCloseUnshownOrder(record: IntentRecord, now: ServerTime | null): boolean {
  if (
    record.kind !== 'createOrder' ||
    record.state === 'applied' ||
    record.state === 'submitting'
  ) {
    return false;
  }
  if (!record.maybeApplied) return true; // every attempt was refused before anything happened
  if (record.lastSentAt === null || now === null) return false; // when it was sent is unknown
  return now.earliest >= record.lastSentAt + ORDER_LIFETIME_MS + LATE_ARRIVAL_MARGIN_MS;
}

/** Whether polling reads can still teach us something about this intent. */
export function needsReads(record: IntentRecord): boolean {
  switch (record.kind) {
    case 'payOrder':
      // A pending payment is read by its ID. An unknown one is read only for the one thing an
      // order read proves (paid by another payer); its own resend is what settles it.
      return record.state === 'unknown' || record.resource?.status === 'pending';
    case 'createOrder':
      // The till follows its order until it is paid or expired. A lost create response has no
      // read path (there is no order list), so only a same-key replay can settle it.
      return record.resource?.status === 'open' || record.resource?.status === 'paying';
    case 'refundPayment':
      // Refunds are found by ID only; matching amount, reason or time would be guesswork.
      return record.resource?.status === 'pending';
  }
}

export type ReplayCheck =
  | { allowed: true }
  | { allowed: false; reason: 'server_time_unknown' | 'retention_may_have_expired' };

/**
 * Whether sending this intent again with its key is safe. Within the server's retention a replay
 * returns the original result; after it, the same key would create a NEW order, payment or refund.
 * The age is measured in server time from the first attempt; if it cannot be established, no replay.
 */
export function replayPermission(record: IntentRecord, now: ServerTime | null): ReplayCheck {
  if (!now) return { allowed: false, reason: 'server_time_unknown' };
  if (record.firstSentAt === null) return { allowed: true };
  return now.latest - record.firstSentAt < REPLAY_WINDOW_MS
    ? { allowed: true }
    : { allowed: false, reason: 'retention_may_have_expired' };
}

/** The target an action works on: one active intent per target. */
export function targetOf(record: IntentRecord): string {
  switch (record.kind) {
    case 'createOrder':
      return 'till-order';
    case 'payOrder':
      return `order:${record.payload.orderId}`;
    case 'refundPayment':
      return `payment:${record.payload.paymentId}`;
  }
}

/** Payloads are compared structurally; key order does not matter. */
export function samePayload(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
