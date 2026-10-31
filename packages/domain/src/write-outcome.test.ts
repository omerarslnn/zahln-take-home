import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ApiResult } from '@mensa/api';
import { classifyWrite } from './write-outcome';

const meta = { status: 0, durationMs: 1, serverDate: null, replayed: false };
const problem = (status: number, code: string, retryable: boolean): ApiResult<never> => ({
  kind: 'problem',
  problem: { code, title: code, status, retryable, detail: null },
  meta: { ...meta, status },
});

describe('classifyWrite', () => {
  it('decides by documented Problem code, not by HTTP status', () => {
    assert.deepEqual(classifyWrite('createPayment', problem(503, 'payments_disabled', false)), {
      type: 'refused',
      code: 'payments_disabled',
      final: false,
    });
    assert.deepEqual(classifyWrite('createPayment', problem(503, 'unavailable', true)), {
      type: 'refused',
      code: 'unavailable',
      final: false,
    });
    // A 503 page from a proxy is not a Problem: the server may or may not have acted.
    const html: ApiResult<never> = {
      kind: 'invalid_response',
      reason: 'unexpected_error_body',
      meta: { ...meta, status: 503 },
    };
    assert.equal(classifyWrite('createPayment', html).type, 'ambiguous');
  });

  it('ignores `retryable` when deciding whether the write happened', () => {
    assert.deepEqual(classifyWrite('createPayment', problem(409, 'order_already_paid', true)), {
      type: 'refused',
      code: 'order_already_paid',
      final: true,
    });
    assert.equal(classifyWrite('createPayment', problem(504, 'timeout', false)).type, 'ambiguous');
  });

  it('treats lost, gateway, malformed, mismatched and undocumented outcomes as maybe applied', () => {
    const lost: ApiResult<never> = { kind: 'no_response', reason: 'timeout', durationMs: 15_000 };
    const malformed: ApiResult<never> = {
      kind: 'invalid_response',
      reason: 'invalid_resource',
      meta,
    };
    for (const result of [
      lost,
      malformed,
      problem(502, 'connection_dropped', true),
      problem(422, 'idempotency_mismatch', false),
      problem(418, 'not_in_the_contract', false),
    ]) {
      assert.equal(classifyWrite('createRefund', result).type, 'ambiguous');
    }
    // A code documented for payments is undocumented for orders: no guessing across operations.
    assert.equal(
      classifyWrite('createOrder', problem(409, 'order_already_paid', false)).type,
      'ambiguous',
    );
  });
});
