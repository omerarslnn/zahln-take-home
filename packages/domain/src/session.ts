import type {
  ApiClient,
  ApiResult,
  AppConfig,
  CreateOrder,
  CreatePayment,
  CreateRefund,
  IdempotencyKey,
  LoginRequest,
  Order,
  Payment,
  PaymentDetail,
  PaymentPage,
  PaymentQuery,
  Refund,
  Session,
  User,
} from '@mensa/api';
import { realScheduler, type Scheduler } from './scheduler';

/**
 * Credentials of a seeded mock account (the task's student, staff, guest and cashier logins).
 * Kept in memory only, so the coordinator can log the SAME account in again when its 5-minute token
 * expires. This is a mock-specific mechanism: a production app would use refresh tokens or a
 * device-bound credential instead of holding a password.
 */
export interface SeededAccount {
  username: string;
  password: string;
}

export type SessionFailure =
  'invalid_credentials' | 'login_unavailable' | 'account_mismatch' | 'expired_again';

/** An API result, or why no usable result exists for the current account. */
export type CallResult<T> =
  | ApiResult<T>
  | { kind: 'session_unavailable'; reason: SessionFailure }
  | { kind: 'no_session' }
  | { kind: 'account_changed' };

export type SignInResult =
  { ok: true; user: User } | { ok: false; reason: SessionFailure | 'superseded' };

const isSessionExpired = (result: ApiResult<unknown>) =>
  result.kind === 'problem' && result.problem.code === 'session_expired';

/**
 * Owns the signed-in account and its bearer token (memory only, never persisted or logged).
 *
 * - One re-login per account at a time: concurrent `session_expired` responses share it.
 * - The re-login must return the same server user ID, or nothing continues ('account_mismatch').
 * - Every sign-in or sign-out starts a new generation; a request or re-login that started in an
 *   earlier generation reports 'account_changed' instead of its result, so a late response can
 *   never update another user's state.
 */
export class SessionCoordinator {
  private generation = 0;
  private account: SeededAccount | null = null;
  private session: Session | null = null;
  private renewal: Promise<Session | SessionFailure> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly maxLoginAttempts: number;
  private readonly retryDelayMs: number;
  private readonly scheduler: Scheduler;

  constructor(
    private readonly login: (credentials: LoginRequest) => Promise<ApiResult<Session>>,
    options: { maxLoginAttempts?: number; retryDelayMs?: number; scheduler?: Scheduler } = {},
  ) {
    this.maxLoginAttempts = options.maxLoginAttempts ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.scheduler = options.scheduler ?? realScheduler;
  }

  user(): User | null {
    return this.session?.user ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signIn(account: SeededAccount): Promise<SignInResult> {
    const generation = this.reset(account);
    const outcome = await this.authenticate(account);
    if (generation !== this.generation) return { ok: false, reason: 'superseded' };
    if (typeof outcome === 'string') return { ok: false, reason: outcome };
    this.session = outcome;
    this.emit();
    return { ok: true, user: outcome.user };
  }

  signOut(): void {
    this.reset(null);
  }

  /**
   * Runs an authenticated call for `expectedUserId`. On `session_expired` it renews the session
   * and repeats the call once; the call closure carries the original idempotency key and payload,
   * so a repeated write is the same intent. It refuses to run for any other user.
   */
  async run<T>(
    expectedUserId: string,
    call: (accessToken: string) => Promise<ApiResult<T>>,
  ): Promise<CallResult<T>> {
    const generation = this.generation;
    const session = this.session;
    if (!session) return { kind: 'no_session' };
    if (session.user.id !== expectedUserId) return { kind: 'account_changed' };

    const first = await call(session.accessToken);
    if (generation !== this.generation) return { kind: 'account_changed' };
    if (!isSessionExpired(first)) return first;

    const renewed = await this.renew(generation, session);
    if (generation !== this.generation) return { kind: 'account_changed' };
    if (typeof renewed === 'string') return { kind: 'session_unavailable', reason: renewed };

    const second = await call(renewed.accessToken);
    if (generation !== this.generation) return { kind: 'account_changed' };
    return isSessionExpired(second)
      ? { kind: 'session_unavailable', reason: 'expired_again' }
      : second;
  }

  private renew(generation: number, expired: Session): Promise<Session | SessionFailure> {
    // Another caller may already have renewed it.
    if (this.session && this.session !== expired) return Promise.resolve(this.session);
    if (this.renewal) return this.renewal;
    const account = this.account;
    if (!account) return Promise.resolve('invalid_credentials');

    const renewal = this.authenticate(account).then((outcome) => {
      if (typeof outcome === 'string' || generation !== this.generation) return outcome;
      if (outcome.user.id !== expired.user.id) return 'account_mismatch' as const;
      this.session = outcome;
      this.emit();
      return outcome;
    });
    this.renewal = renewal;
    void renewal.finally(() => {
      if (this.renewal === renewal) this.renewal = null;
    });
    return renewal;
  }

  /** Logs in with bounded attempts. Repeating a login is safe: it moves no money. */
  private async authenticate(account: SeededAccount): Promise<Session | SessionFailure> {
    for (let attempt = 1; attempt <= this.maxLoginAttempts; attempt += 1) {
      const result = await this.login({ username: account.username, password: account.password });
      if (result.kind === 'success') return result.data;
      if (result.kind === 'problem' && result.problem.code === 'invalid_credentials') {
        return 'invalid_credentials';
      }
      if (attempt < this.maxLoginAttempts) await this.delay(this.retryDelayMs * attempt);
    }
    return 'login_unavailable';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.scheduler.setTimer(resolve, ms));
  }

  private reset(account: SeededAccount | null): number {
    this.generation += 1;
    this.account = account;
    this.session = null;
    this.renewal = null;
    this.emit();
    return this.generation;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** The calls the intent controller makes, bound to one signed-in user. */
export interface ScopedApi {
  /** Unauthenticated; also refreshes the server clock through the transport. */
  getConfig(): Promise<ApiResult<AppConfig>>;
  createOrder(body: CreateOrder, key: IdempotencyKey): Promise<CallResult<Order>>;
  getOrder(orderId: string): Promise<CallResult<Order>>;
  createPayment(
    orderId: string,
    body: CreatePayment,
    key: IdempotencyKey,
  ): Promise<CallResult<Payment>>;
  listPayments(query: PaymentQuery): Promise<CallResult<PaymentPage>>;
  getPayment(paymentId: string): Promise<CallResult<PaymentDetail>>;
  createRefund(
    paymentId: string,
    body: CreateRefund,
    key: IdempotencyKey,
  ): Promise<CallResult<Refund>>;
}

export function createScopedApi(
  client: ApiClient,
  session: SessionCoordinator,
  userId: string,
): ScopedApi {
  return {
    getConfig: () => client.getConfig(),
    createOrder: (body, key) =>
      session.run(userId, (token) => client.createOrder(token, body, key)),
    getOrder: (orderId) => session.run(userId, (token) => client.getOrder(token, orderId)),
    createPayment: (orderId, body, key) =>
      session.run(userId, (token) => client.createPayment(token, orderId, body, key)),
    listPayments: (query) => session.run(userId, (token) => client.listPayments(token, query)),
    getPayment: (paymentId) => session.run(userId, (token) => client.getPayment(token, paymentId)),
    createRefund: (paymentId, body, key) =>
      session.run(userId, (token) => client.createRefund(token, paymentId, body, key)),
  };
}
