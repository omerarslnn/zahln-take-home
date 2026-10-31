// Test-only. A deterministic, in-memory stand-in for the mock API at the HTTP level: it is plugged
// in as `fetch`, so tests exercise the real transport, the real response validation and the real
// domain code. It follows the documented server rules (idempotency with 24 h retention, versions,
// one non-declined payment per order, refund capacity, role scoping) and injects the failures the
// brief describes. These are SIMULATED server effects, not evidence about the real server.
import type { OrderStatus, PaymentStatus, PriceGroup, RefundStatus, Role } from '@mensa/api';

export type Route =
  | 'getConfig'
  | 'createSession'
  | 'listMensas'
  | 'createOrder'
  | 'getOrder'
  | 'createPayment'
  | 'listPayments'
  | 'getPayment'
  | 'createRefund';

/** A failure for the next request to a route. `applied`: the server did the work before failing. */
export type Fault =
  | { type: 'lose_response'; applied: boolean }
  | { type: 'gateway'; code: 'connection_dropped' | 'timeout'; applied: boolean }
  | { type: 'proxy_html'; applied: boolean }
  | { type: 'malformed_success'; body: string }
  | { type: 'problem'; status: number; code: string }
  /** An out-of-date read: `depth` versions back (default 1); a list misses its `depth` newest payments. */
  | { type: 'stale'; depth?: number }
  /** A hostile or broken response that names another payer. */
  | { type: 'foreign_payer' }
  | { type: 'bad_date' };

interface FakeUser {
  id: string;
  username: string;
  role: Role;
  priceGroup: PriceGroup | null;
  tillId: string | null;
}

interface OrderState {
  id: string;
  tillId: string;
  items: { itemId: string; quantity: number }[];
  status: OrderStatus;
  paymentId: string | null;
  createdAt: number;
  expiresAt: number;
  version: number;
}

interface PaymentState {
  id: string;
  orderId: string;
  tillId: string;
  payerId: string;
  priceGroup: PriceGroup;
  amountCents: number;
  status: PaymentStatus;
  createdAt: number;
  updatedAt: number;
  version: number;
  events: { at: number; type: string; amountCents: number | null; refundId: string | null }[];
}

interface RefundState {
  id: string;
  paymentId: string;
  amountCents: number;
  status: RefundStatus;
  reason: string | null;
  createdAt: number;
  updatedAt: number;
}

interface StoredResult {
  route: Route;
  body: string;
  status: number;
  response: unknown;
  at: number;
}

interface Reply {
  status: number;
  body: unknown;
  replayed?: boolean;
}

export const CANDIDATE_ID = 'c_test';
export const PASSWORD = 'secret-test';
const DAY_MS = 24 * 60 * 60 * 1000;
const MENU: Record<string, Record<PriceGroup, number>> = {
  itm_pasta: { student: 500, staff: 650, guest: 800 },
  itm_salad: { student: 280, staff: 390, guest: 490 },
};

export class FakeMensaServer {
  readonly config = { minAppVersion: '1.0.0', paymentsEnabled: true };
  /** Writes that changed server state (replays do not count). */
  readonly applied = { createOrder: 0, createPayment: 0, createRefund: 0 };
  readonly requests: { route: Route; idempotencyKey: string | null; body: string | null }[] = [];
  readonly users: FakeUser[] = [
    {
      id: 'usr_student',
      username: 'student',
      role: 'student',
      priceGroup: 'student',
      tillId: null,
    },
    { id: 'usr_staff', username: 'staff', role: 'staff', priceGroup: 'staff', tillId: null },
    { id: 'usr_cashier', username: 'cashier', role: 'cashier', priceGroup: null, tillId: 'till_1' },
  ];
  private readonly faults = new Map<Route, Fault[]>();
  private readonly tokens = new Map<string, string>();
  private readonly expiredTokens = new Set<string>();
  private readonly orders = new Map<string, OrderState[]>();
  private readonly payments = new Map<string, PaymentState[]>();
  private readonly refunds = new Map<string, RefundState>();
  private readonly idempotency = new Map<string, StoredResult>();
  private readonly holds = new Map<Route, Promise<void>>();
  private sequence = 0;
  /** Called when a request arrives, before the server does anything. */
  onRequest: ((route: Route) => void) | null = null;

  constructor(private readonly now: () => number) {}

  inject(route: Route, ...faults: Fault[]): void {
    this.faults.set(route, [...(this.faults.get(route) ?? []), ...faults]);
  }

  /** Requests to `route` wait until the returned function is called (to interleave events). */
  hold(route: Route): () => void {
    let release: () => void = () => undefined;
    this.holds.set(route, new Promise<void>((resolve) => (release = resolve)));
    return () => {
      this.holds.delete(route);
      release();
    };
  }

  orderExpiresAt(orderId: string): number {
    return latest(this.orders.get(orderId) ?? []).expiresAt;
  }

  expireSessions(): void {
    for (const token of this.tokens.keys()) this.expiredTokens.add(token);
    this.tokens.clear();
  }

  postedWrites(route: Route): { idempotencyKey: string | null; body: string | null }[] {
    return this.requests.filter((request) => request.route === route);
  }

  paymentsForOrder(orderId: string): PaymentState[] {
    return [...this.payments.values()].map(latest).filter((payment) => payment.orderId === orderId);
  }

  refundsForPayment(paymentId: string): RefundState[] {
    return [...this.refunds.values()].filter((refund) => refund.paymentId === paymentId);
  }

  settlePayment(paymentId: string, status: 'confirmed' | 'declined'): void {
    const payment = this.updatePayment(paymentId, (current) => ({
      ...current,
      status,
      events: [
        ...current.events,
        { at: this.now(), type: `payment_${status}`, amountCents: null, refundId: null },
      ],
    }));
    this.updateOrder(payment.orderId, (order) =>
      status === 'confirmed'
        ? { ...order, status: 'paid' }
        : { ...order, status: this.now() >= order.expiresAt ? 'expired' : 'open', paymentId: null },
    );
  }

  finishRefund(refundId: string, status: 'completed' | 'failed'): void {
    const refund = this.refunds.get(refundId);
    if (!refund) throw new Error(`unknown refund ${refundId}`);
    this.refunds.set(refundId, { ...refund, status, updatedAt: this.now() });
    this.updatePayment(refund.paymentId, (payment) => ({ ...payment }));
  }

  /** Creates an order directly (as if another till did), bypassing the API. */
  seedOrder(items: { itemId: string; quantity: number }[], id?: string): string {
    return this.insertOrder('till_1', items, id).id;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : null;
    const method = init?.method ?? 'GET';
    const [route, ids] = routeOf(method, url.pathname);
    this.requests.push({ route, idempotencyKey: headers.get('idempotency-key'), body });
    this.onRequest?.(route);
    await this.holds.get(route);
    const fault = this.faults.get(route)?.shift();

    if (fault?.type === 'problem') return this.problem(fault.status, fault.code);
    if (fault && 'applied' in fault && !fault.applied) return this.failure(fault);

    const staleDepth = fault?.type === 'stale' ? (fault.depth ?? 1) : 0;
    const reply = this.handle(route, ids, headers, body, url, staleDepth);
    if (!fault || fault.type === 'stale') return this.json(reply);
    if (fault.type === 'foreign_payer')
      return this.json({ ...reply, body: foreignPayer(reply.body) });
    switch (fault.type) {
      case 'lose_response':
      case 'gateway':
      case 'proxy_html':
        return this.failure(fault);
      case 'malformed_success':
        return new Response(fault.body, { status: reply.status, headers: this.headers() });
      case 'bad_date':
        return this.json(reply, 'Fri, 31 Feb 2026 11:00:00 GMT');
    }
  };

  // ---- request handling --------------------------------------------------------------------------

  private handle(
    route: Route,
    ids: string[],
    headers: Headers,
    body: string | null,
    url: URL,
    staleDepth: number,
  ): Reply {
    if (headers.get('x-candidate-id') !== CANDIDATE_ID)
      return problemReply(403, 'unknown_candidate');
    if (route === 'getConfig') return { status: 200, body: this.config };
    if (route === 'createSession') return this.login(body);

    const token = headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
    if (this.expiredTokens.has(token)) return problemReply(401, 'session_expired');
    const user = this.users.find((candidate) => candidate.id === this.tokens.get(token));
    if (!user) return problemReply(401, 'unauthorized');

    switch (route) {
      case 'listMensas':
        return { status: 200, body: { items: [] } };
      case 'getOrder':
        return this.readOrder(user, ids[0] ?? '', staleDepth);
      case 'getPayment':
        return this.readPayment(user, ids[0] ?? '', staleDepth);
      case 'listPayments':
        return this.list(user, url.searchParams, staleDepth);
      case 'createOrder':
      case 'createPayment':
      case 'createRefund':
        return this.idempotent(route, user, headers, body ?? '', () =>
          this.write(
            route,
            user,
            ids[0] ?? '',
            JSON.parse(body ?? '{}') as Record<string, unknown>,
            headers,
          ),
        );
    }
  }

  private login(body: string | null): Reply {
    const credentials = JSON.parse(body ?? '{}') as { username?: string; password?: string };
    const user = this.users.find((candidate) => candidate.username === credentials.username);
    if (!user || credentials.password !== PASSWORD) return problemReply(401, 'invalid_credentials');
    const token = `tok_${(this.sequence += 1)}`;
    this.tokens.set(token, user.id);
    return {
      status: 201,
      body: {
        accessToken: token,
        tokenType: 'Bearer',
        expiresAt: iso(this.now() + 5 * 60_000),
        user: {
          id: user.id,
          displayName: user.username,
          role: user.role,
          priceGroup: user.priceGroup,
          tillId: user.tillId,
          mensaId: user.tillId ? 'mensa_1' : null,
        },
      },
    };
  }

  /** Same key + same body within 24 h replays the stored result; another body is a 422. */
  private idempotent(
    route: Route,
    user: FakeUser,
    headers: Headers,
    body: string,
    run: () => Reply,
  ): Reply {
    const key = headers.get('idempotency-key');
    if (!key) return problemReply(400, 'invalid_request');
    const slot = `${user.id}:${key}`;
    const stored = this.idempotency.get(slot);
    if (stored && this.now() - stored.at < DAY_MS) {
      if (stored.route !== route || stored.body !== body)
        return problemReply(422, 'idempotency_mismatch');
      return { status: stored.status, body: stored.response, replayed: true };
    }
    const reply = run();
    if (reply.status < 300) {
      this.idempotency.set(slot, {
        route,
        body,
        status: reply.status,
        response: reply.body,
        at: this.now(),
      });
    }
    return reply;
  }

  private write(
    route: 'createOrder' | 'createPayment' | 'createRefund',
    user: FakeUser,
    id: string,
    body: Record<string, unknown>,
    headers: Headers,
  ): Reply {
    if (route === 'createOrder') {
      if (user.role !== 'cashier' || !user.tillId) return problemReply(403, 'forbidden');
      const order = this.insertOrder(
        user.tillId,
        body.items as { itemId: string; quantity: number }[],
      );
      this.applied.createOrder += 1;
      return { status: 201, body: this.orderView(order, user) };
    }
    if (route === 'createPayment') return this.pay(user, id, Number(body.amountCents), headers);
    return this.refund(user, id, Number(body.amountCents), (body.reason as string | null) ?? null);
  }

  private pay(user: FakeUser, orderId: string, amountCents: number, headers: Headers): Reply {
    if (!user.priceGroup) return problemReply(403, 'forbidden');
    const order = this.expireIfDue(orderId);
    if (!order) return problemReply(404, 'not_found');
    if (!this.config.paymentsEnabled) return problemReply(503, 'payments_disabled');
    if (versionBelow(headers.get('x-app-version') ?? '', this.config.minAppVersion)) {
      return problemReply(426, 'app_version_unsupported');
    }
    if (order.status === 'expired') return problemReply(409, 'order_expired');
    if (order.status === 'paying') return problemReply(409, 'order_payment_in_progress');
    if (order.status === 'paid') return problemReply(409, 'order_already_paid');
    const group = user.priceGroup;
    if (amountCents !== totalFor(order, group)) return problemReply(409, 'amount_mismatch');
    const payment: PaymentState = {
      id: `pay_${(this.sequence += 1)}`,
      orderId,
      tillId: order.tillId,
      payerId: user.id,
      priceGroup: group,
      amountCents,
      status: 'pending',
      createdAt: this.now(),
      updatedAt: this.now(),
      version: 1,
      events: [{ at: this.now(), type: 'payment_created', amountCents, refundId: null }],
    };
    this.payments.set(payment.id, [payment]);
    this.updateOrder(orderId, (current) => ({
      ...current,
      status: 'paying',
      paymentId: payment.id,
    }));
    this.applied.createPayment += 1;
    return { status: 201, body: this.paymentView(payment, false) };
  }

  private refund(
    user: FakeUser,
    paymentId: string,
    amountCents: number,
    reason: string | null,
  ): Reply {
    const history = this.payments.get(paymentId);
    if (!history) return problemReply(404, 'not_found');
    const payment = latest(history);
    if (user.role !== 'cashier' || user.tillId !== payment.tillId)
      return problemReply(403, 'forbidden');
    if (payment.status !== 'confirmed') return problemReply(422, 'payment_not_refundable');
    if (amountCents > this.refundable(payment)) return problemReply(409, 'refund_exceeds_payment');
    const refund: RefundState = {
      id: `ref_${(this.sequence += 1)}`,
      paymentId,
      amountCents,
      status: 'pending',
      reason,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.refunds.set(refund.id, refund);
    this.updatePayment(paymentId, (current) => ({
      ...current,
      events: [
        ...current.events,
        { at: this.now(), type: 'refund_requested', amountCents, refundId: refund.id },
      ],
    }));
    this.applied.createRefund += 1;
    return { status: 201, body: refundView(refund) };
  }

  // ---- reads ---------------------------------------------------------------------------------------

  private readOrder(user: FakeUser, orderId: string, staleDepth: number): Reply {
    this.expireIfDue(orderId);
    const history = this.orders.get(orderId);
    if (!history) return problemReply(404, 'not_found');
    const order = earlier(history, staleDepth);
    if (user.role === 'cashier' && user.tillId !== order.tillId)
      return problemReply(404, 'not_found');
    return { status: 200, body: this.orderView(order, user) };
  }

  private readPayment(user: FakeUser, paymentId: string, staleDepth: number): Reply {
    const history = this.payments.get(paymentId);
    if (!history) return problemReply(404, 'not_found');
    const payment = earlier(history, staleDepth);
    if (user.priceGroup && payment.payerId !== user.id) return problemReply(404, 'not_found');
    if (user.role === 'cashier' && user.tillId !== payment.tillId)
      return problemReply(403, 'forbidden');
    return { status: 200, body: this.paymentView(payment, true) };
  }

  /** Newest first, scoped by role, `q` as a prefix; `cursor` is an offset into the list. */
  private list(user: FakeUser, params: URLSearchParams, staleDepth: number): Reply {
    const prefix = params.get('q') ?? '';
    const visible = [...this.payments.values()]
      .map(latest)
      .filter((payment) =>
        user.priceGroup ? payment.payerId === user.id : payment.tillId === user.tillId,
      )
      .filter((payment) =>
        [payment.id, payment.orderId, payment.payerId].some((value) => value.startsWith(prefix)),
      )
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
      .slice(staleDepth);
    const offset = Number(params.get('cursor') ?? 0);
    const limit = Number(params.get('limit') ?? 50);
    const page = visible.slice(offset, offset + limit);
    const next = offset + limit < visible.length ? String(offset + limit) : null;
    return {
      status: 200,
      body: { items: page.map((payment) => this.paymentView(payment, false)), nextCursor: next },
    };
  }

  // ---- state ---------------------------------------------------------------------------------------

  private insertOrder(
    tillId: string,
    items: { itemId: string; quantity: number }[],
    id?: string,
  ): OrderState {
    const order: OrderState = {
      id: id ?? `ord_${(this.sequence += 1)}`,
      tillId,
      items,
      status: 'open',
      paymentId: null,
      createdAt: this.now(),
      expiresAt: this.now() + 5 * 60_000,
      version: 1,
    };
    this.orders.set(order.id, [order]);
    return order;
  }

  private expireIfDue(orderId: string): OrderState | undefined {
    const history = this.orders.get(orderId);
    if (!history) return undefined;
    const order = latest(history);
    if (order.status === 'open' && this.now() >= order.expiresAt) {
      // As observed on the live API (2026-10-31): expiry changes the status, not the version.
      const expired: OrderState = { ...order, status: 'expired' };
      history.push(expired);
      return expired;
    }
    return order;
  }

  private updateOrder(orderId: string, change: (order: OrderState) => OrderState): OrderState {
    const history = this.orders.get(orderId) ?? [];
    const next = { ...change(latest(history)), version: latest(history).version + 1 };
    history.push(next);
    return next;
  }

  private updatePayment(
    paymentId: string,
    change: (payment: PaymentState) => PaymentState,
  ): PaymentState {
    const history = this.payments.get(paymentId) ?? [];
    const current = latest(history);
    const next = { ...change(current), version: current.version + 1, updatedAt: this.now() };
    history.push(next);
    return next;
  }

  private refundable(payment: PaymentState): number {
    const reserved = this.refundsForPayment(payment.id)
      .filter((refund) => refund.status !== 'failed')
      .reduce((sum, refund) => sum + refund.amountCents, 0);
    return payment.status === 'confirmed' ? payment.amountCents - reserved : 0;
  }

  // ---- representations -----------------------------------------------------------------------------

  private orderView(order: OrderState, user: FakeUser): unknown {
    const payer = user.priceGroup;
    const ownPayment =
      order.paymentId && this.payments.has(order.paymentId)
        ? latest(this.payments.get(order.paymentId) ?? []).payerId === user.id
        : false;
    return {
      id: order.id,
      status: order.status,
      mensa: { id: 'mensa_1', name: 'Mensa' },
      till: { id: order.tillId, name: 'Till' },
      items: order.items.map(({ itemId, quantity }) => ({
        itemId,
        name: { de: itemId, en: itemId },
        quantity,
        ...(payer ? { unitPriceCents: MENU[itemId]?.[payer] ?? 0 } : { unitPrices: MENU[itemId] }),
      })),
      qrPayload: `zahln://pay?order=${order.id}`, // the format observed on the live API
      ...(payer
        ? {
            priceGroup: payer,
            amountCents: totalFor(order, payer),
            paymentId: ownPayment ? order.paymentId : null,
          }
        : {
            amounts: {
              student: totalFor(order, 'student'),
              staff: totalFor(order, 'staff'),
              guest: totalFor(order, 'guest'),
            },
            paymentId: order.paymentId,
          }),
      createdAt: iso(order.createdAt),
      expiresAt: iso(order.expiresAt),
      version: order.version,
    };
  }

  private paymentView(payment: PaymentState, detail: boolean): unknown {
    const refunds = this.refundsForPayment(payment.id);
    const sum = (status: RefundStatus) =>
      refunds
        .filter((refund) => refund.status === status)
        .reduce((total, refund) => total + refund.amountCents, 0);
    const base = {
      id: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      amountCents: payment.amountCents,
      currency: 'EUR',
      priceGroup: payment.priceGroup,
      mensa: { id: 'mensa_1', name: 'Mensa' },
      till: { id: payment.tillId, name: 'Till' },
      payer: { id: payment.payerId, displayName: payment.payerId },
      items: [],
      refundedAmountCents: sum('completed'),
      pendingRefundAmountCents: sum('pending'),
      refundableAmountCents: this.refundable(payment),
      needsAttention: false,
      attentionReasons: [],
      createdAt: iso(payment.createdAt),
      updatedAt: iso(payment.updatedAt),
      version: payment.version,
    };
    if (!detail) return base;
    return {
      ...base,
      refunds: refunds.map(refundView),
      history: payment.events.map((event) => ({ ...event, at: iso(event.at) })),
    };
  }

  // ---- responses -------------------------------------------------------------------------------------

  private headers(date?: string): Headers {
    return new Headers({
      date: date ?? new Date(Math.floor(this.now() / 1000) * 1000).toUTCString(),
    });
  }

  private json(reply: Reply, date?: string): Response {
    const headers = this.headers(date);
    headers.set(
      'content-type',
      reply.status < 300 ? 'application/json' : 'application/problem+json',
    );
    if (reply.replayed) headers.set('idempotent-replayed', 'true');
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers });
  }

  private problem(status: number, code: string): Response {
    return this.json(problemReply(status, code));
  }

  private failure(
    fault: Exclude<
      Fault,
      { type: 'problem' | 'stale' | 'bad_date' | 'malformed_success' | 'foreign_payer' }
    >,
  ): Response {
    if (fault.type === 'lose_response') throw new TypeError('Network request failed');
    if (fault.type === 'gateway')
      return this.problem(fault.code === 'timeout' ? 504 : 502, fault.code);
    const headers = this.headers();
    headers.set('content-type', 'text/html');
    return new Response('<html><body>502 Bad Gateway</body></html>', { status: 502, headers });
  }
}

function routeOf(method: string, path: string): [Route, string[]] {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [first, id, sub] = parts;
  if (first === 'config') return ['getConfig', []];
  if (first === 'sessions') return ['createSession', []];
  if (first === 'mensas') return ['listMensas', []];
  if (first === 'orders' && !id) return ['createOrder', []];
  if (first === 'orders' && sub === 'payments') return ['createPayment', [id ?? '']];
  if (first === 'orders') return ['getOrder', [id ?? '']];
  if (first === 'payments' && sub === 'refunds') return ['createRefund', [id ?? '']];
  if (first === 'payments' && id) return ['getPayment', [id]];
  if (first === 'payments' && method === 'GET') return ['listPayments', []];
  throw new Error(`fake server has no route for ${method} ${path}`);
}

function latest<T>(history: T[]): T {
  const last = history.at(-1);
  if (last === undefined) throw new Error('empty history');
  return last;
}

/** The state `depth` versions before the latest (the oldest one if there are fewer). */
function earlier<T>(history: T[], depth: number): T {
  return history[Math.max(0, history.length - 1 - depth)] ?? latest(history);
}

/** Rewrites every payer in a response body to someone else, as a hostile server might. */
function foreignPayer(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const record = body as Record<string, unknown>;
  if ('payer' in record) return { ...record, payer: { id: 'usr_intruder', displayName: 'X' } };
  // A page of payments; checked second because a payment has an `items` list of its own.
  return Array.isArray(record.items) ? { ...record, items: record.items.map(foreignPayer) } : body;
}

function totalFor(order: OrderState, group: PriceGroup): number {
  return order.items.reduce(
    (sum, item) => sum + (MENU[item.itemId]?.[group] ?? 0) * item.quantity,
    0,
  );
}

function versionBelow(version: string, minimum: string): boolean {
  const parse = (value: string) => value.split('.').map(Number);
  const [a, b] = [parse(version), parse(minimum)];
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) < (b[index] ?? 0);
  }
  return false;
}

function refundView(refund: RefundState): unknown {
  return {
    id: refund.id,
    paymentId: refund.paymentId,
    amountCents: refund.amountCents,
    currency: 'EUR',
    status: refund.status,
    reason: refund.reason,
    createdAt: iso(refund.createdAt),
    updatedAt: iso(refund.updatedAt),
  };
}

function problemReply(status: number, code: string): Reply {
  return { status, body: { code, title: code, status, retryable: status >= 500 } };
}

function iso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}
