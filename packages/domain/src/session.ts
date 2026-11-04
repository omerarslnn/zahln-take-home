import type {
  ApiClient,
  ApiResult,
  AppConfig,
  CreateOrder,
  CreatePayment,
  CreateRefund,
  IdempotencyKey,
  LoginRequest,
  MensaList,
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
 * Credentials for `POST /sessions`, typed in by the user or taken from a published demo account.
 * The mock has only its seeded accounts, so both are the same kind of thing.
 *
 * Mock-only credential retention: while an account is signed in, the coordinator keeps its
 * credentials in memory (never persisted, never logged) so it can log the SAME account in again
 * when the 5-minute token expires. They are dropped on sign-out, on every new sign-in and as soon as
 * the server rejects them. This is not production-grade credential storage: a production app would
 * hold a refresh token or a device-bound credential, never the password.
 */
export interface SeededAccount {
  username: string;
  password: string;
}

/**
 * Why a login produced no session: the server refused the credentials, the device could not reach
 * it at all (no connection, or the server unreachable), or it answered without a session (busy,
 * timed out, a broken response).
 */
export type LoginFailure = 'invalid_credentials' | 'no_connection' | 'login_unavailable';

/** Why an authenticated call could not run for the current account. */
export type SessionFailure =
  'invalid_credentials' | 'login_unavailable' | 'account_mismatch' | 'expired_again';

/** An API result, or why no usable result exists for the current account. */
export type CallResult<T> =
  | ApiResult<T>
  | { kind: 'session_unavailable'; reason: SessionFailure }
  | { kind: 'no_session' }
  | { kind: 'account_changed' };

/**
 * `wrong_role`: the credentials are valid, but for an account this app does not serve (a cashier
 * in the student app). `superseded`: a newer sign-in or a sign-out replaced this one.
 */
export type SignInResult =
  { ok: true; user: User } | { ok: false; reason: LoginFailure | 'wrong_role' | 'superseded' };

/** A re-login problem as calls report it; the connection detail matters only on the sign-in screen. */
const asSessionFailure = (failure: LoginFailure): SessionFailure =>
  failure === 'no_connection' ? 'login_unavailable' : failure;

/**
 * The session has ended. The contract names `session_expired`, but the live API answers a token that
 * has been expired for about a minute with plain `401 unauthorized` (observed 2026-11-01), so both
 * mean "log in again". A 401 means the server did nothing, so repeating the same call is safe.
 */
const isSessionExpired = (result: ApiResult<unknown>) =>
  result.kind === 'problem' &&
  (result.problem.code === 'session_expired' || result.problem.code === 'unauthorized');

/**
 * Owns the signed-in account and its bearer token (memory only, never persisted or logged).
 *
 * - Only an account `acceptsUser` approves is ever published: for any other, `user()` stays null
 *   and listeners are not called, so no screen and no payment controller sees it, even briefly.
 * - One re-login per account at a time: concurrent `session_expired` responses share it.
 * - The re-login must return the same server user ID (and an accepted account), or nothing
 *   continues ('account_mismatch').
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
  private readonly acceptsUser: (user: User) => boolean;

  constructor(
    private readonly login: (credentials: LoginRequest) => Promise<ApiResult<Session>>,
    options: {
      maxLoginAttempts?: number;
      retryDelayMs?: number;
      scheduler?: Scheduler;
      /** Which accounts this app serves (payers in the student app, cashiers in the till). */
      acceptsUser?: (user: User) => boolean;
    } = {},
  ) {
    this.maxLoginAttempts = options.maxLoginAttempts ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.scheduler = options.scheduler ?? realScheduler;
    this.acceptsUser = options.acceptsUser ?? (() => true);
  }

  user(): User | null {
    return this.session?.user ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Signs `account` in, replacing whoever was signed in. The role is checked BEFORE the session is
   * published: a wrong-role account is never visible through `user()` or a listener.
   */
  async signIn(account: SeededAccount): Promise<SignInResult> {
    const generation = this.reset(account);
    const outcome = await this.authenticate(account);
    if (generation !== this.generation) return { ok: false, reason: 'superseded' };
    if (typeof outcome === 'string' || !this.acceptsUser(outcome.user)) {
      this.account = null; // credentials that produced no session are not kept
      return { ok: false, reason: typeof outcome === 'string' ? outcome : 'wrong_role' };
    }
    this.session = outcome;
    this.emit();
    return { ok: true, user: outcome.user };
  }

  /** Whether credentials are held in memory for re-login (only while an account is signed in). */
  holdsCredentials(): boolean {
    return this.account !== null;
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

    const renewal = this.authenticate(account).then((outcome) =>
      this.adoptRenewal(generation, expired, outcome),
    );
    this.renewal = renewal;
    void renewal.finally(() => {
      if (this.renewal === renewal) this.renewal = null;
    });
    return renewal;
  }

  /**
   * A re-login counts only in its own generation, for the same server user, and for an account this
   * app accepts. Credentials the server refused, or that now belong to someone else, are dropped.
   */
  private adoptRenewal(
    generation: number,
    expired: Session,
    outcome: Session | LoginFailure,
  ): Session | SessionFailure {
    if (generation !== this.generation) {
      return typeof outcome === 'string' ? asSessionFailure(outcome) : outcome; // caller discards it
    }
    if (outcome === 'no_connection' || outcome === 'login_unavailable') {
      return asSessionFailure(outcome); // kept: the next call may renew once the server answers
    }
    if (outcome === 'invalid_credentials') {
      this.account = null;
      return outcome;
    }
    if (outcome.user.id !== expired.user.id || !this.acceptsUser(outcome.user)) {
      this.account = null;
      return 'account_mismatch';
    }
    this.session = outcome;
    this.emit();
    return outcome;
  }

  /** Logs in with bounded attempts. Repeating a login is safe: it moves no money. */
  private async authenticate(account: SeededAccount): Promise<Session | LoginFailure> {
    let failure: LoginFailure = 'login_unavailable';
    for (let attempt = 1; attempt <= this.maxLoginAttempts; attempt += 1) {
      const result = await this.login({ username: account.username, password: account.password });
      if (result.kind === 'success') return result.data;
      if (result.kind === 'problem' && result.problem.code === 'invalid_credentials') {
        return 'invalid_credentials';
      }
      // The last attempt decides: no connection at all, or a server that answered without a session.
      failure =
        result.kind === 'no_response' && result.reason === 'network'
          ? 'no_connection'
          : 'login_unavailable';
      if (attempt < this.maxLoginAttempts) await this.delay(this.retryDelayMs * attempt);
    }
    return failure;
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
  /** Mensas, their tills and menus with the price of each group. */
  listMensas(): Promise<CallResult<MensaList>>;
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
    listMensas: () => session.run(userId, (token) => client.listMensas(token)),
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
