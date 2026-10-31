import { decode, type Decoder } from './decode';
import * as schemas from './schemas';
import type { RequestOptions, Transport, TransportResult } from './transport';
import type {
  AppConfig,
  CreateOrder,
  CreatePayment,
  CreateRefund,
  DailyTotals,
  LoginRequest,
  MensaList,
  Order,
  Payment,
  PaymentDetail,
  PaymentPage,
  PaymentQuery,
  Refund,
  Session,
} from './types';

/**
 * The key of one deliberate write (order, payment or refund). A branded type: a write wrapper
 * cannot be called with an ad-hoc string, only with a key that went through `toIdempotencyKey`,
 * which the intent layer does once per intent.
 */
export type IdempotencyKey = string & { readonly __idempotencyKey: true };

/** Checks the contract's limits (1–255 characters) and that the key is a valid header value. */
export function toIdempotencyKey(value: string): IdempotencyKey {
  if (value.length < 1 || value.length > 255 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new RangeError('An Idempotency-Key must be 1 to 255 visible ASCII characters');
  }
  return value as IdempotencyKey;
}

/** A transport result whose `success` data has passed runtime validation. */
export type ApiResult<T> = TransportResult<T>;

/**
 * Typed wrappers for the endpoints the app flows use. Roles are enforced by the server; the notes
 * say which role each call is meant for. Writes take a mandatory idempotency key; login does not
 * (a repeated login only creates another session).
 */
export interface ApiClient {
  /** GET /config: public remote configuration (minimum app version, payments switch). */
  getConfig(): Promise<ApiResult<AppConfig>>;
  /** POST /sessions: logs in a seeded user. The returned token lasts at most 5 minutes. */
  createSession(credentials: LoginRequest): Promise<ApiResult<Session>>;
  /** GET /mensas: mensas with tills and menus; prices in cents per price group. */
  listMensas(accessToken: string): Promise<ApiResult<MensaList>>;
  /** POST /orders (cashier): rings up an order at the cashier's own till. */
  createOrder(
    accessToken: string,
    body: CreateOrder,
    idempotencyKey: IdempotencyKey,
  ): Promise<ApiResult<Order>>;
  /** GET /orders/{id}: payer view (own amount, own paymentId only) or cashier view (own till). */
  getOrder(accessToken: string, orderId: string): Promise<ApiResult<Order>>;
  /** POST /orders/{id}/payments (student, staff, guest): `amountCents` is what the payer saw. */
  createPayment(
    accessToken: string,
    orderId: string,
    body: CreatePayment,
    idempotencyKey: IdempotencyKey,
  ): Promise<ApiResult<Payment>>;
  /** GET /payments: own payments (payer), own till (cashier) or all (finance). Newest first. */
  listPayments(accessToken: string, query?: PaymentQuery): Promise<ApiResult<PaymentPage>>;
  /** GET /payments/{id}: one payment with its refunds and full history. */
  getPayment(accessToken: string, paymentId: string): Promise<ApiResult<PaymentDetail>>;
  /** POST /payments/{id}/refunds (cashier of the payment's till): full or partial refund. */
  createRefund(
    accessToken: string,
    paymentId: string,
    body: CreateRefund,
    idempotencyKey: IdempotencyKey,
  ): Promise<ApiResult<Refund>>;
  /** GET /reports/daily-totals (finance): totals for one Europe/Berlin day (YYYY-MM-DD). */
  getDailyTotals(accessToken: string, date?: string): Promise<ApiResult<DailyTotals>>;
}

export function createApiClient(transport: Transport): ApiClient {
  const call = <T>(decoder: Decoder<T>, root: string, options: RequestOptions) =>
    transport.request<unknown>(options).then((result) => validated(result, decoder, root));
  const path = (...segments: string[]) => `/${segments.map(encodeURIComponent).join('/')}`;

  return {
    getConfig: () => call(schemas.appConfig, 'config', { method: 'GET', path: '/config' }),
    createSession: (credentials) =>
      call(schemas.session, 'session', { method: 'POST', path: '/sessions', body: credentials }),
    listMensas: (accessToken) =>
      call(schemas.mensaList, 'mensas', { method: 'GET', path: '/mensas', accessToken }),
    createOrder: (accessToken, body, idempotencyKey) =>
      call(schemas.order, 'order', {
        method: 'POST',
        path: '/orders',
        body,
        accessToken,
        idempotencyKey,
      }),
    getOrder: (accessToken, orderId) =>
      call(schemas.order, 'order', { method: 'GET', path: path('orders', orderId), accessToken }),
    createPayment: (accessToken, orderId, body, idempotencyKey) =>
      call(schemas.payment, 'payment', {
        method: 'POST',
        path: path('orders', orderId, 'payments'),
        body,
        accessToken,
        idempotencyKey,
      }),
    listPayments: (accessToken, query = {}) =>
      call(schemas.paymentPage, 'payments', {
        method: 'GET',
        path: '/payments',
        query,
        accessToken,
      }),
    getPayment: (accessToken, paymentId) =>
      call(schemas.paymentDetail, 'payment', {
        method: 'GET',
        path: path('payments', paymentId),
        accessToken,
      }),
    createRefund: (accessToken, paymentId, body, idempotencyKey) =>
      call(schemas.refund, 'refund', {
        method: 'POST',
        path: path('payments', paymentId, 'refunds'),
        body,
        accessToken,
        idempotencyKey,
      }),
    getDailyTotals: (accessToken, date) =>
      call(schemas.dailyTotals, 'dailyTotals', {
        method: 'GET',
        path: '/reports/daily-totals',
        query: { date },
        accessToken,
      }),
  };
}

/**
 * Turns a 2xx body into a validated resource. An empty or malformed 2xx body becomes
 * `invalid_response`, never a success: after a write that means "outcome unknown", not "done".
 */
function validated<T>(
  result: TransportResult<unknown>,
  decoder: Decoder<T>,
  root: string,
): ApiResult<T> {
  if (result.kind !== 'success') return result;
  const decoded = decode(decoder, result.data, root);
  return decoded.ok
    ? { kind: 'success', data: decoded.value, meta: result.meta }
    : {
        kind: 'invalid_response',
        reason: 'invalid_resource',
        detail: decoded.error.message,
        meta: result.meta,
      };
}
