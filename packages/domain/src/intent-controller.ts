import { toIdempotencyKey, type Order, type Payment, type Refund, type Role } from '@mensa/api';
import {
  afterUnapplied,
  beginAttempt,
  isFinal,
  needsReads,
  newIntent,
  notChargedPaidByOther,
  recoverAfterRestart,
  replayPermission,
  samePayload,
  targetOf,
  withOrder,
  withPayment,
  withRefund,
  type CreateOrderIntent,
  type IntentRecord,
  type NewIntent,
  type PayOrderIntent,
  type RefundIntent,
  type Scope,
} from './intent';
import type { IntentStore } from './intent-store';
import type { GateState, PaymentGate } from './payment-gate';
import { Poller, type PollingOptions, type PollState } from './poller';
import { ResourceCache } from './resource-cache';
import type { Scheduler } from './scheduler';
import type { ServerClock, ServerTime } from './server-clock';
import type { ScopedApi } from './session';
import { classifyWrite, type AttemptOutcome } from './write-outcome';

export type NotAllowedReason =
  | 'wrong_role'
  | 'invalid_payload'
  | 'server_time_unknown'
  | 'already_paid'
  | 'payment_not_refundable'
  | 'exceeds_refundable'
  | 'refundable_unknown'
  | 'unreadable_records';

/** What starting an action did. Only 'submitted' created a new intent, and with it a new key. */
export type StartOutcome =
  | { type: 'submitted'; intent: IntentRecord }
  | { type: 'existing'; intent: IntentRecord }
  | { type: 'conflict'; intent: IntentRecord }
  | { type: 'blocked'; gate: GateState }
  | { type: 'not_allowed'; reason: NotAllowedReason }
  | { type: 'storage_failed' };

export type RetryOutcome =
  | { type: 'attempted'; intent: IntentRecord }
  | { type: 'not_needed'; intent: IntentRecord }
  | { type: 'blocked'; gate: GateState }
  | {
      type: 'replay_not_allowed';
      reason: 'server_time_unknown' | 'retention_may_have_expired';
      intent: IntentRecord;
    }
  | { type: 'storage_failed'; intent: IntentRecord }
  | { type: 'not_found' };

export interface IntentControllerOptions {
  scope: Scope;
  role: Role;
  api: ScopedApi;
  store: IntentStore;
  clock: ServerClock;
  scheduler: Scheduler;
  /** Random key source: expo-crypto UUIDs in the apps, a deterministic sequence in tests. */
  newKey: () => string;
  gate: PaymentGate;
  polling?: PollingOptions;
}

/** What a round of reads learned about one intent. */
type Observation =
  | { type: 'order'; order: Order }
  | { type: 'payment'; payment: Payment }
  | { type: 'refund'; refund: Refund; paymentVersion: number }
  | { type: 'not_charged' }
  | { type: 'none' };

const PAYER_ROLES: ReadonlySet<Role> = new Set(['student', 'staff', 'guest']);
const STORAGE_FAILED = Symbol('storage_failed');
type Attempted = IntentRecord | typeof STORAGE_FAILED;

/**
 * Orchestrates the intents of one scope (candidate + signed-in user):
 *   start → save (must succeed) → send once → classify → save → poll reads until settled.
 *
 * The controller sends writes only for a user action: starting an action, or `retry` (same key and
 * payload, only inside the replay window). On its own it only reads. There is no offline queue and
 * nothing is resubmitted on reconnect or restart.
 */
export class IntentController {
  readonly cache = new ResourceCache();
  /** Stored entries that could not be read back. Reported, never dropped silently. */
  unreadable = 0;
  private readonly records = new Map<string, IntentRecord>();
  private readonly inFlight = new Map<string, Promise<Attempted>>();
  private readonly starting = new Map<string, Promise<StartOutcome>>();
  private readonly listeners = new Set<() => void>();
  private readonly poller: Poller;
  private readQueue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(private readonly options: IntentControllerOptions) {
    this.poller = new Poller(
      options.scheduler,
      (keys) => this.pollRound(keys),
      () => this.emit(),
      options.polling,
    );
  }

  list(): IntentRecord[] {
    return [...this.records.values()];
  }

  get(key: string): IntentRecord | undefined {
    return this.records.get(key);
  }

  pollState(key: string): PollState {
    return this.poller.state(key);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Loads this scope's saved intents. "Maybe sent" ones become unknown and are read, not resent. */
  async load(): Promise<void> {
    const { records, unreadable } = await this.options.store.load(this.options.scope);
    this.unreadable = unreadable;
    for (const stored of records) {
      const record = recoverAfterRestart(stored);
      if (record !== stored) await this.persist(record);
      this.records.set(record.key, record);
      if (needsReads(record)) this.poller.track(record.key);
    }
    this.emit();
  }

  /** Pauses polling while the owning screen or app is inactive; resuming reads at once. */
  setActive(active: boolean): void {
    this.poller.setActive(active);
  }

  /** Stops polling and ignores late results, e.g. on sign-out or account switch. */
  dispose(): void {
    this.disposed = true;
    this.poller.stop();
    this.listeners.clear();
  }

  // ---- actions ----------------------------------------------------------------------------------

  /** Pays an order with the amount the payer was shown. Gated by version and maintenance. */
  payOrder(
    orderId: string,
    amountCents: number,
    options: { afterFinalKey?: string } = {},
  ): Promise<StartOutcome> {
    return this.startOnce(`order:${orderId}`, async () => {
      if (!PAYER_ROLES.has(this.options.role)) return notAllowed('wrong_role');
      if (!orderId || !isPositiveCents(amountCents)) return notAllowed('invalid_payload');
      const input: NewIntent = { kind: 'payOrder', payload: { orderId, amountCents } };
      const existing = this.current(`order:${orderId}`);
      const reused = await this.reuse(existing, input, options.afterFinalKey);
      if (reused) return reused;
      const gate = await this.options.gate.refresh();
      if (gate.status !== 'open') return { type: 'blocked', gate };
      return this.submitNew(input, existing);
    });
  }

  /** Rings up an order at the cashier's till: one order intent in progress at a time. */
  createOrder(
    items: { itemId: string; quantity: number }[],
    options: { afterFinalKey?: string } = {},
  ): Promise<StartOutcome> {
    return this.startOnce('till-order', async () => {
      if (this.options.role !== 'cashier') return notAllowed('wrong_role');
      if (!validOrderItems(items)) return notAllowed('invalid_payload');
      const lines = items.map(({ itemId, quantity }) => ({ itemId, quantity }));
      const input: NewIntent = { kind: 'createOrder', payload: { items: lines } };
      const existing = this.current('till-order');
      const reused = await this.reuse(existing, input, options.afterFinalKey);
      if (reused) return reused;
      return this.submitNew(input, existing);
    });
  }

  /** Refunds part or all of a payment, after checking the server's refundable amount. */
  refund(
    paymentId: string,
    amountCents: number,
    reason: string | null,
    options: { afterFinalKey?: string } = {},
  ): Promise<StartOutcome> {
    return this.startOnce(`payment:${paymentId}`, async () => {
      if (this.options.role !== 'cashier') return notAllowed('wrong_role');
      if (!paymentId || !isPositiveCents(amountCents) || (reason?.length ?? 0) > 200) {
        return notAllowed('invalid_payload');
      }
      const input: NewIntent = {
        kind: 'refundPayment',
        payload: { paymentId, amountCents, reason },
      };
      const existing = this.current(`payment:${paymentId}`);
      const reused = await this.reuse(existing, input, options.afterFinalKey);
      if (reused) return reused;
      // refundableAmountCents already subtracts completed AND pending refunds.
      const detail = await this.options.api.getPayment(paymentId);
      if (detail.kind !== 'success') return notAllowed('refundable_unknown');
      const payment = this.cache.putPaymentDetail(detail.data);
      if (payment.status !== 'confirmed') return notAllowed('payment_not_refundable');
      if (amountCents > payment.refundableAmountCents) return notAllowed('exceeds_refundable');
      return this.submitNew(input, existing);
    });
  }

  /**
   * Sends an existing intent again: same key, same payload, after the user asked for it. Allowed
   * only inside the replay window; beyond it, or while server time is unknown, only reads are used.
   */
  async retry(key: string): Promise<RetryOutcome> {
    const record = this.records.get(key);
    if (!record) return { type: 'not_found' };
    if (record.state === 'applied' || record.state === 'rejected') {
      return { type: 'not_needed', intent: record };
    }
    if (record.kind === 'payOrder') {
      const gate = await this.options.gate.refresh();
      if (gate.status !== 'open') return { type: 'blocked', gate };
    }
    const permission = replayPermission(record, await this.serverTime());
    if (!permission.allowed) {
      if (needsReads(record)) this.poller.track(key);
      return { type: 'replay_not_allowed', reason: permission.reason, intent: record };
    }
    const result = await this.attempt(this.records.get(key) ?? record);
    return result === STORAGE_FAILED
      ? { type: 'storage_failed', intent: record }
      : { type: 'attempted', intent: result };
  }

  /** Reads the server state of one intent now. Reads never overlap; they run one after another. */
  reconcile(key: string): Promise<IntentRecord | undefined> {
    const run = this.readQueue.then(() => this.readAndApply(key));
    this.readQueue = run.catch(() => undefined);
    return run;
  }

  /** Removes a settled intent after its result was shown. The server keeps the history. */
  async acknowledge(key: string): Promise<boolean> {
    const record = this.records.get(key);
    if (!record || !isFinal(record) || this.inFlight.has(key)) return false;
    await this.forget(key);
    return true;
  }

  // ---- writes -----------------------------------------------------------------------------------

  /**
   * Repeated taps and duplicate callbacks get the existing intent back; nothing new is sent. A
   * different action on the same target is refused while the first is unresolved (e.g. no second
   * refund while the first one's response was lost). After a known final result, only an explicit
   * `afterFinalKey` naming that result starts a new action.
   */
  private async reuse(
    existing: IntentRecord | undefined,
    input: NewIntent,
    afterFinalKey: string | undefined,
  ): Promise<StartOutcome | null> {
    if (!existing) return null;
    if (!isFinal(existing)) {
      if (!samePayload(existing.payload, input.payload))
        return { type: 'conflict', intent: existing };
      const running = this.inFlight.get(existing.key);
      const settled = running ? await running : existing;
      return { type: 'existing', intent: settled === STORAGE_FAILED ? existing : settled };
    }
    if (afterFinalKey !== existing.key) return { type: 'existing', intent: existing };
    // Only a declined or refused payment can be followed by a new attempt on the same order.
    if (existing.kind === 'payOrder' && existing.resource?.status === 'confirmed') {
      return notAllowed('already_paid');
    }
    return null;
  }

  private async submitNew(
    input: NewIntent,
    replaces: IntentRecord | undefined,
  ): Promise<StartOutcome> {
    if (!(await this.serverTime())) return notAllowed('server_time_unknown');
    const record = newIntent(input, toIdempotencyKey(this.options.newKey()), this.options.scope);
    const result = await this.attempt(record);
    if (result === STORAGE_FAILED) return { type: 'storage_failed' };
    if (replaces) await this.forget(replaces.key);
    return { type: 'submitted', intent: result };
  }

  /** One attempt; concurrent calls for the same key share it. */
  private attempt(record: IntentRecord): Promise<Attempted> {
    const running = this.inFlight.get(record.key);
    if (running) return running;
    const attempt = this.runAttempt(record).finally(() => this.inFlight.delete(record.key));
    this.inFlight.set(record.key, attempt);
    return attempt;
  }

  private async runAttempt(record: IntentRecord): Promise<Attempted> {
    const now = this.options.clock.now();
    if (!now) return record;
    const sending = beginAttempt(record, now);
    // Durable BEFORE the request leaves: a crash after sending must still find this record.
    try {
      await this.options.store.save(sending);
    } catch {
      return STORAGE_FAILED;
    }
    this.update(sending);
    const settled = await this.send(sending);
    if (this.disposed) return settled;
    await this.persist(settled);
    this.update(settled);
    if (needsReads(settled)) this.poller.track(settled.key);
    return settled;
  }

  /** Sends the write for the record's kind and applies the outcome to the CURRENT record. */
  private async send(record: IntentRecord): Promise<IntentRecord> {
    const { api } = this.options;
    const key = toIdempotencyKey(record.key);
    const latest = () => this.records.get(record.key) ?? record;
    switch (record.kind) {
      case 'createOrder': {
        const result = await api.createOrder({ items: record.payload.items }, key);
        return this.settle(
          latest(),
          classifyWrite('createOrder', result),
          (current, order: Order) =>
            current.kind === 'createOrder'
              ? withOrder(current, this.cache.putOrder(order))
              : current,
        );
      }
      case 'payOrder': {
        const { orderId, amountCents } = record.payload;
        const outcome = classifyWrite(
          'createPayment',
          await api.createPayment(orderId, { amountCents }, key),
        );
        if (outcome.type === 'refused') this.noteGateRefusal(outcome.code);
        return this.settle(latest(), outcome, (current, payment: Payment) =>
          current.kind === 'payOrder' && this.isOwnPayment(payment, current)
            ? withPayment(current, this.cache.putPayment(payment))
            : afterUnapplied(current, { type: 'ambiguous', reason: 'unexpected_resource' }),
        );
      }
      case 'refundPayment': {
        const { paymentId, amountCents, reason } = record.payload;
        const result = await api.createRefund(paymentId, { amountCents, reason }, key);
        return this.settle(
          latest(),
          classifyWrite('createRefund', result),
          (current, refund: Refund) =>
            current.kind === 'refundPayment' && refund.paymentId === paymentId
              ? withRefund(current, refund, null)
              : afterUnapplied(current, { type: 'ambiguous', reason: 'unexpected_resource' }),
        );
      }
    }
  }

  private settle<R>(
    current: IntentRecord,
    outcome: AttemptOutcome<R>,
    apply: (current: IntentRecord, resource: R) => IntentRecord,
  ): IntentRecord {
    return outcome.type === 'applied'
      ? apply(current, outcome.resource)
      : afterUnapplied(current, outcome);
  }

  private noteGateRefusal(code: string): void {
    if (code === 'app_version_unsupported' || code === 'payments_disabled') {
      this.options.gate.noteServerRefusal(code);
    }
  }

  // ---- reads ------------------------------------------------------------------------------------

  private async pollRound(keys: string[]): Promise<void> {
    for (const key of keys) await this.reconcile(key);
  }

  private async readAndApply(key: string): Promise<IntentRecord | undefined> {
    const before = this.records.get(key);
    if (!before || this.disposed) return before;
    const observation = await this.observe(before);
    // Apply to the record as it is NOW: an attempt may have settled it while we were reading.
    const current = this.records.get(key);
    if (!current || this.disposed) return current;
    const after = applyObservation(current, observation);
    if (after !== current) {
      await this.persist(after);
      this.update(after);
    }
    if (!needsReads(after)) this.poller.untrack(key);
    return after;
  }

  private observe(record: IntentRecord): Promise<Observation> {
    switch (record.kind) {
      case 'payOrder':
        return this.observePayment(record);
      case 'createOrder':
        return this.observeOrder(record);
      case 'refundPayment':
        return this.observeRefund(record);
    }
  }

  private async observePayment(record: PayOrderIntent): Promise<Observation> {
    const { api } = this.options;
    if (record.resource) {
      const known = await api.getPayment(record.resource.paymentId);
      return known.kind === 'success'
        ? { type: 'payment', payment: this.cache.putPaymentDetail(known.data) }
        : { type: 'none' };
    }
    if (record.state !== 'unknown') return { type: 'none' };

    // 1. The payer's view of an order names the payment being checked or that paid it, but only
    //    the payer's own.
    const orderResult = await api.getOrder(record.payload.orderId);
    const order = orderResult.kind === 'success' ? this.cache.putOrder(orderResult.data) : null;
    if (order?.paymentId) {
      const detail = await api.getPayment(order.paymentId);
      if (detail.kind === 'success' && this.isOwnPayment(detail.data, record)) {
        return { type: 'payment', payment: this.cache.putPaymentDetail(detail.data) };
      }
    }
    // 2. The payer's own payments, searched by order ID. `q` is a prefix search, so every hit is
    //    checked exactly, and a payment already linked to another intent is not taken twice.
    const list = await api.listPayments({ q: record.payload.orderId, limit: 50 });
    if (list.kind === 'success') {
      const ours = list.data.items.filter(
        (payment) =>
          this.isOwnPayment(payment, record) && !this.linkedElsewhere(payment.id, record.key),
      );
      if (ours.length === 1 && ours[0])
        return { type: 'payment', payment: this.cache.putPayment(ours[0]) };
    }
    // 3. Paid, but by no payment this payer can see: someone else paid it. This payer's attempt
    //    was never applied or was declined. It is never read as "you paid".
    if (order?.status === 'paid' && !order.paymentId) return { type: 'not_charged' };
    return { type: 'none' };
  }

  private async observeOrder(record: CreateOrderIntent): Promise<Observation> {
    // A lost create response cannot be found by reading (there is no order list): only a
    // same-key replay inside the retention window recovers it.
    if (!record.resource) return { type: 'none' };
    const result = await this.options.api.getOrder(record.resource.orderId);
    return result.kind === 'success'
      ? { type: 'order', order: this.cache.putOrder(result.data) }
      : { type: 'none' };
  }

  private async observeRefund(record: RefundIntent): Promise<Observation> {
    // Refunds are recognised by ID only. Matching amount, reason or time could pick someone else's.
    if (!record.resource) return { type: 'none' };
    const result = await this.options.api.getPayment(record.payload.paymentId);
    if (result.kind !== 'success') return { type: 'none' };
    this.cache.putPaymentDetail(result.data);
    const refund = result.data.refunds.find((item) => item.id === record.resource?.refundId);
    return refund
      ? { type: 'refund', refund, paymentVersion: result.data.version }
      : { type: 'none' };
  }

  // ---- helpers ----------------------------------------------------------------------------------

  /** The record for a target: an unresolved one first, otherwise the latest settled one. */
  private current(target: string): IntentRecord | undefined {
    const matches = [...this.records.values()].filter((record) => targetOf(record) === target);
    return matches.find((record) => !isFinal(record)) ?? matches.at(-1);
  }

  /**
   * Runs one start per target at a time. Fails closed while any saved record of this scope cannot
   * be read: it might be an unresolved intent for the very same action, so starting a new one could
   * repeat it (a second refund, a second order).
   */
  private startOnce(target: string, start: () => Promise<StartOutcome>): Promise<StartOutcome> {
    if (this.unreadable > 0) return Promise.resolve(notAllowed('unreadable_records'));
    const running = this.starting.get(target);
    if (running) return running.then(asExisting);
    const started = start().finally(() => this.starting.delete(target));
    this.starting.set(target, started);
    return started;
  }

  private isOwnPayment(payment: Payment, record: PayOrderIntent): boolean {
    return (
      payment.orderId === record.payload.orderId &&
      payment.payer.id === this.options.scope.userId &&
      payment.amountCents === record.payload.amountCents
    );
  }

  private linkedElsewhere(paymentId: string, key: string): boolean {
    return this.list().some(
      (record) =>
        record.key !== key &&
        record.kind === 'payOrder' &&
        record.resource?.paymentId === paymentId,
    );
  }

  /** Server time; if unknown, one unauthenticated read refreshes it through the transport. */
  private async serverTime(): Promise<ServerTime | null> {
    if (!this.options.clock.now()) await this.options.api.getConfig();
    return this.options.clock.now();
  }

  private async persist(record: IntentRecord): Promise<void> {
    try {
      await this.options.store.save(record);
    } catch {
      // The previously saved state is more conservative ("maybe sent"), so recovery stays safe.
    }
  }

  private async forget(key: string): Promise<void> {
    this.poller.untrack(key);
    this.records.delete(key);
    this.emit();
    try {
      await this.options.store.remove(this.options.scope, key);
    } catch {
      // A settled record left behind is harmless; it is removed on the next acknowledgement.
    }
  }

  private update(record: IntentRecord): void {
    this.records.set(record.key, record);
    this.emit();
  }

  private emit(): void {
    if (this.disposed) return;
    for (const listener of this.listeners) listener();
  }
}

function applyObservation(current: IntentRecord, observation: Observation): IntentRecord {
  switch (observation.type) {
    case 'order':
      return current.kind === 'createOrder' ? withOrder(current, observation.order) : current;
    case 'payment':
      return current.kind === 'payOrder' ? withPayment(current, observation.payment) : current;
    case 'refund':
      return current.kind === 'refundPayment'
        ? withRefund(current, observation.refund, observation.paymentVersion)
        : current;
    case 'not_charged':
      return current.kind === 'payOrder' && current.state === 'unknown'
        ? notChargedPaidByOther(current)
        : current;
    case 'none':
      return current;
  }
}

function asExisting(outcome: StartOutcome): StartOutcome {
  return outcome.type === 'submitted' ? { type: 'existing', intent: outcome.intent } : outcome;
}

function notAllowed(reason: NotAllowedReason): StartOutcome {
  return { type: 'not_allowed', reason };
}

function isPositiveCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validOrderItems(items: { itemId: string; quantity: number }[]): boolean {
  return (
    items.length >= 1 &&
    items.length <= 20 &&
    items.every(
      ({ itemId, quantity }) =>
        itemId !== '' && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 20,
    )
  );
}
