import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApiClient, toIdempotencyKey } from './client';
import { createTransport } from './transport';

const KEY = toIdempotencyKey('intent-key-1');

function clientReturning(status: number, body: unknown, headers: Record<string, string> = {}) {
  const requests: { url: string; headers: Headers }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push({ url, headers: new Headers(init?.headers) });
    const text = body === undefined ? '' : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status, headers }));
  };
  const client = createApiClient(
    createTransport({ baseUrl: 'https://api.test', candidateId: 'c_test', fetchImpl }),
  );
  return { client, requests };
}

const ref = { id: 'ref_1', name: 'Mensa am Campus' };
const text = { de: 'Pasta', en: 'Pasta' };

const payerOrder = {
  id: 'ord_1',
  status: 'open',
  mensa: ref,
  till: ref,
  items: [{ itemId: 'itm_1', name: text, quantity: 1, unitPriceCents: 350 }],
  qrPayload: 'opaque',
  priceGroup: 'student',
  amountCents: 350,
  paymentId: null,
  createdAt: '2026-10-31T10:00:00.000Z',
  expiresAt: '2026-10-31T10:05:00.000Z',
  version: 1,
};

const payment = {
  id: 'pay_1',
  orderId: 'ord_1',
  status: 'confirmed',
  amountCents: 350,
  priceGroup: 'student',
  mensa: ref,
  till: ref,
  payer: { id: 'usr_1', displayName: 'Student' },
  items: [{ itemId: 'itm_1', name: text, quantity: 1, unitPriceCents: 350 }],
  refundedAmountCents: 350,
  pendingRefundAmountCents: 0,
  refundableAmountCents: 0,
  needsAttention: false,
  attentionReasons: [],
  createdAt: '2026-10-31T10:00:00.000Z',
  updatedAt: '2026-10-31T10:01:00.000Z',
  version: 4,
};

describe('createApiClient validation', () => {
  it('accepts role-specific fields as absent or null and fills the documented currency default', async () => {
    const { client } = clientReturning(200, payerOrder);
    const result = await client.getOrder('token', 'ord_1');

    assert.equal(result.kind, 'success');
    if (result.kind !== 'success') return;
    assert.equal(result.data.amounts, undefined); // cashier-only field, absent for a payer
    assert.equal(result.data.paymentId, null);
    assert.equal(result.data.currency, 'EUR');
  });

  it('accepts zero refundable cents and a negative report net total', async () => {
    const paid = await clientReturning(200, payment).client.getPayment('t', 'pay_1');
    assert.equal(paid.kind, 'invalid_response'); // a payment detail also needs refunds and history

    const detail = await clientReturning(200, {
      ...payment,
      refunds: [],
      history: [],
    }).client.getPayment('t', 'pay_1');
    assert.equal(detail.kind === 'success' && detail.data.refundableAmountCents, 0);

    const totals = {
      paymentCount: 1,
      grossCents: 350,
      refundedCents: 900,
      netCents: -550,
      pendingCount: 0,
      pendingCents: 0,
      date: '2026-10-31',
      mensas: [],
    };
    assert.equal((await clientReturning(200, totals).client.getDailyTotals('t')).kind, 'success');
    const negativeGross = { ...totals, grossCents: -1 };
    assert.equal(
      (await clientReturning(200, negativeGross).client.getDailyTotals('t')).kind,
      'invalid_response',
    );
  });

  it('never turns an empty or malformed 2xx write response into a payment', async () => {
    const empty = await clientReturning(201, undefined).client.createPayment(
      't',
      'ord_1',
      { amountCents: 350 },
      KEY,
    );
    assert.deepEqual(
      [empty.kind, empty.kind === 'invalid_response' && empty.reason],
      ['invalid_response', 'invalid_resource'],
    );

    const fractional = { ...payment, status: 'pending', amountCents: 3.5 };
    const malformed = await clientReturning(201, fractional).client.createPayment(
      't',
      'ord_1',
      { amountCents: 350 },
      KEY,
    );
    assert.equal(malformed.kind, 'invalid_response');
    assert.equal(
      malformed.kind === 'invalid_response' && malformed.detail,
      'payment.amountCents: expected integer',
    );
  });

  it('treats the access token as an opaque, non-empty credential', async () => {
    const session = {
      accessToken: 'not-a-jwt',
      expiresAt: '2026-10-31T10:05:00.000Z',
      user: {
        id: 'usr_1',
        displayName: 'Student',
        role: 'student',
        priceGroup: 'student',
        tillId: null,
        mensaId: null,
      },
    };
    const ok = await clientReturning(201, session).client.createSession({
      username: 's',
      password: 'p',
    });
    assert.equal(ok.kind === 'success' && ok.data.tokenType, 'Bearer');

    const noToken = await clientReturning(201, {
      ...session,
      accessToken: '',
    }).client.createSession({
      username: 's',
      password: 'p',
    });
    assert.equal(noToken.kind, 'invalid_response');
  });

  it('sends the branded idempotency key and encodes path segments', async () => {
    const { client, requests } = clientReturning(201, {
      id: 'ref_9',
      paymentId: 'pay/1',
      amountCents: 100,
      status: 'pending',
      reason: null,
      createdAt: '2026-10-31T10:00:00.000Z',
      updatedAt: '2026-10-31T10:00:00.000Z',
    });
    await client.createRefund('t', 'pay/1', { amountCents: 100 }, KEY);

    assert.equal(requests[0]?.url, 'https://api.test/payments/pay%2F1/refunds');
    assert.equal(requests[0]?.headers.get('idempotency-key'), 'intent-key-1');
  });

  it('rejects idempotency keys outside the contract limits', () => {
    assert.throws(() => toIdempotencyKey(''), RangeError);
    assert.throws(() => toIdempotencyKey('a'.repeat(256)), RangeError);
    assert.throws(() => toIdempotencyKey('has space'), RangeError);
    assert.equal(toIdempotencyKey('0b6f6a1e-2c1d-4f5e-9a7b-1c2d3e4f5a6b').length, 36);
  });
});
