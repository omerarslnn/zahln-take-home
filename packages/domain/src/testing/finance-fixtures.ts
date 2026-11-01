// Test-only builders for the finance reads: valid resources and the results a read can produce.
import type { DailyTotals, Payment, PaymentPage, ResponseMeta } from '@mensa/api';
import type { Scheduler } from '../scheduler';
import type { CallResult } from '../session';

let sequence = 0;

export function payment(overrides: Partial<Payment> = {}): Payment {
  sequence += 1;
  return {
    id: `pay_${String(sequence).padStart(4, '0')}`,
    orderId: `ord_${String(sequence).padStart(4, '0')}`,
    status: 'confirmed',
    amountCents: 340,
    currency: 'EUR',
    priceGroup: 'student',
    mensa: { id: 'mensa_campus', name: 'Mensa am Campus' },
    till: { id: 'till_campus_1', name: 'Kasse 1' },
    payer: { id: 'usr_student', displayName: 'Test Student' },
    items: [
      { itemId: 'itm_pasta', name: { de: 'Pasta', en: 'Pasta' }, quantity: 1, unitPriceCents: 340 },
    ],
    refundedAmountCents: 0,
    pendingRefundAmountCents: 0,
    refundableAmountCents: 340,
    needsAttention: false,
    attentionReasons: [],
    createdAt: '2026-10-29T11:00:00.000Z',
    updatedAt: '2026-10-29T11:00:02.000Z',
    version: 2,
    ...overrides,
  };
}

const zeroTotals = {
  paymentCount: 0,
  grossCents: 0,
  refundedCents: 0,
  netCents: 0,
  pendingCount: 0,
  pendingCents: 0,
};

export function dailyTotals(date: string, overrides: Partial<DailyTotals> = {}): DailyTotals {
  return { ...zeroTotals, date, currency: 'EUR', mensas: [], ...overrides };
}

export function meta(serverDate: Date | null = null): ResponseMeta {
  return { status: 200, durationMs: 12, serverDate, replayed: false };
}

export function ok<T>(data: T, serverDate: Date | null = null): CallResult<T> {
  return { kind: 'success', data, meta: meta(serverDate) };
}

export function problem(code: string, status: number, retryable: boolean): CallResult<never> {
  return {
    kind: 'problem',
    problem: { code, title: code, status, retryable, detail: null },
    meta: meta(),
  };
}

export const noResponse: CallResult<never> = {
  kind: 'no_response',
  reason: 'network',
  durationMs: 15_000,
};

export function page(items: Payment[], nextCursor: string | null): CallResult<PaymentPage> {
  return ok({ items, nextCursor });
}

/** Runs timers on the next microtask, so retry delays take no real time. */
export const immediateScheduler: Scheduler = {
  now: () => 0,
  setTimer(callback) {
    let cancelled = false;
    void Promise.resolve().then(() => (cancelled ? undefined : callback()));
    return () => {
      cancelled = true;
    };
  },
};
