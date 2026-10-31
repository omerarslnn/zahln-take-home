import type { CallResult } from './session';

export type WriteOperation = 'createOrder' | 'createPayment' | 'createRefund';

/**
 * What ONE write attempt proves (the transport's facts, interpreted):
 * - `applied`: the server returned the created resource (or replayed it for a repeated key).
 * - `refused`: the server answered with a documented refusal, so THIS attempt changed nothing.
 *   `final` means the action itself was judged (e.g. order_already_paid); otherwise the refusal was
 *   about circumstances (session, maintenance, version) and the same action may succeed later.
 * - `ambiguous`: the write may or may not have happened: no response, a gateway timeout, a dropped
 *   connection, a malformed or empty body, or an undocumented error.
 * - `discarded`: the account changed while the request was in flight; its result is not used.
 * A refusal of a later attempt never proves that an earlier, ambiguous attempt did not happen;
 * combining attempts is `afterUnapplied`'s job in intent.ts.
 */
export type AttemptOutcome<R> =
  | { type: 'applied'; resource: R; replayed: boolean }
  | { type: 'refused'; code: string; final: boolean }
  | { type: 'ambiguous'; reason: string }
  | { type: 'discarded' };

// Codes the API documents as "nothing happened" for reasons outside the action itself.
const CIRCUMSTANTIAL = new Set([
  'unauthorized',
  'session_expired',
  'unknown_candidate',
  'unavailable',
]);

// Codes that judge the action itself, per operation (from the OpenAPI error lists).
const FINAL: Record<WriteOperation, ReadonlySet<string>> = {
  createOrder: new Set(['invalid_request', 'forbidden']),
  createPayment: new Set([
    'invalid_request',
    'forbidden',
    'not_found',
    'order_expired',
    'order_payment_in_progress',
    'order_already_paid',
    'amount_mismatch',
  ]),
  createRefund: new Set([
    'invalid_request',
    'forbidden',
    'not_found',
    'refund_exceeds_payment',
    'payment_not_refundable',
    'refund_window_closed',
  ]),
};

// Payment-only refusals from the version and maintenance gates: not final, the action may succeed later.
const GATE = new Set(['app_version_unsupported', 'payments_disabled']);

export function classifyWrite<R>(
  operation: WriteOperation,
  result: CallResult<R>,
): AttemptOutcome<R> {
  switch (result.kind) {
    case 'success':
      return { type: 'applied', resource: result.data, replayed: result.meta.replayed };
    case 'no_response':
      return { type: 'ambiguous', reason: result.reason === 'timeout' ? 'timeout' : 'no_response' };
    case 'invalid_response':
      return { type: 'ambiguous', reason: result.reason };
    case 'session_unavailable':
    case 'no_session':
      // The request was refused before processing (401) or never sent.
      return { type: 'refused', code: result.kind, final: false };
    case 'account_changed':
      return { type: 'discarded' };
    case 'problem':
      return classifyProblem(operation, result.problem.code);
  }
}

function classifyProblem<R>(operation: WriteOperation, code: string): AttemptOutcome<R> {
  if (FINAL[operation].has(code)) return { type: 'refused', code, final: true };
  if (CIRCUMSTANTIAL.has(code)) return { type: 'refused', code, final: false };
  if (operation === 'createPayment' && GATE.has(code))
    return { type: 'refused', code, final: false };
  // connection_dropped (502), timeout (504), idempotency_mismatch (the key was already used, so
  // something with this key was processed) and any undocumented code: the write may have happened.
  return { type: 'ambiguous', reason: code };
}
