// Test-only. Builds "app instances" (transport, client, clock, session, gate, controller) against the
// fake server and a shared store. A second instance on the same store simulates an app restart in
// the same JS environment; it is NOT an operating-system process kill.
import { createApiClient, createTransport, type ApiClient, type User } from '@mensa/api';
import { IntentController } from '../intent-controller';
import type { Scope } from '../intent';
import { MemoryIntentStore } from './memory-intent-store';
import { PaymentGate } from '../payment-gate';
import type { PollingOptions } from '../poller';
import type { Scheduler } from '../scheduler';
import { ServerClock } from '../server-clock';
import { createScopedApi, SessionCoordinator } from '../session';
import { CANDIDATE_ID, FakeMensaServer, PASSWORD } from './fake-server';

/** Timers on a fake monotonic clock. `advance` runs due timers in order and awaits each one. */
export class FakeScheduler implements Scheduler {
  private timers: { id: number; due: number; callback: () => void | Promise<void> }[] = [];
  private nextId = 0;

  constructor(private readonly time: { now(): number; set(value: number): void }) {}

  now(): number {
    return this.time.now();
  }

  setTimer(callback: () => void | Promise<void>, delayMs: number): () => void {
    const id = (this.nextId += 1);
    this.timers.push({ id, due: this.now() + delayMs, callback });
    return () => {
      this.timers = this.timers.filter((timer) => timer.id !== id);
    };
  }

  /** Timers that have not run yet; something stopped or disposed must leave none behind. */
  pending(): number {
    return this.timers.length;
  }

  async advance(ms: number): Promise<void> {
    const end = this.now() + ms;
    for (;;) {
      const next = this.timers.filter((timer) => timer.due <= end).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      this.timers = this.timers.filter((timer) => timer.id !== next.id);
      this.time.set(Math.max(this.now(), next.due));
      await next.callback();
    }
    this.time.set(end);
  }
}

export interface AppInstance {
  user: User;
  scope: Scope;
  client: ApiClient;
  clock: ServerClock;
  session: SessionCoordinator;
  gate: PaymentGate;
  controller: IntentController;
}

export class TestEnvironment {
  /** Monotonic milliseconds; the fake server's clock is derived from it, so both move together. */
  /** Fractional on purpose, like `performance.now()` on a real device. */
  private mono = 50_000.375;
  readonly serverEpochAtZero = Date.UTC(2026, 9, 31, 11, 0, 0) - this.mono;
  readonly server = new FakeMensaServer(() => this.serverEpochAtZero + this.mono);
  readonly scheduler = new FakeScheduler({
    now: () => this.mono,
    set: (value) => {
      this.mono = value;
    },
  });
  readonly store = new MemoryIntentStore();
  private keySequence = 0;

  advance(ms: number): Promise<void> {
    return this.scheduler.advance(ms);
  }

  async startApp(
    username: string,
    options: {
      appVersion?: string;
      polling?: PollingOptions;
      newKey?: () => string;
      /** A separate store simulates a second device; the default shares one store (same device). */
      store?: MemoryIntentStore;
    } = {},
  ): Promise<AppInstance> {
    const { client, clock } = this.createClient(options.appVersion);
    const session = this.createSession(client);
    const signedIn = await session.signIn({ username, password: PASSWORD });
    if (!signedIn.ok) throw new Error(`sign-in failed: ${signedIn.reason}`);
    const gate = new PaymentGate(options.appVersion ?? '1.0.0', () => client.getConfig());
    const controller = await this.startController(
      { client, clock, session, gate },
      signedIn.user,
      options,
    );
    const scope = { candidateId: CANDIDATE_ID, userId: signedIn.user.id };
    return { user: signedIn.user, scope, client, clock, session, gate, controller };
  }

  /** A client and server clock of one app process, talking to the fake server. */
  createClient(appVersion = '1.0.0'): { client: ApiClient; clock: ServerClock } {
    const clock = new ServerClock(() => this.mono);
    const client = createApiClient(
      createTransport({
        baseUrl: 'https://fake.test',
        candidateId: CANDIDATE_ID,
        appVersion,
        fetchImpl: this.server.fetch,
        // Each read advances a fraction of a millisecond, like `performance.now()` on a device;
        // with whole-millisecond fake time a fractional-timestamp bug once slipped through.
        now: () => (this.mono += 0.125),
        onServerDate: (sample) => clock.observe(sample),
      }),
    );
    return { client, clock };
  }

  /** The app's one session coordinator; `acceptsUser` is the app's role policy. */
  createSession(
    client: ApiClient,
    options: { acceptsUser?: (user: User) => boolean; maxLoginAttempts?: number } = {},
  ): SessionCoordinator {
    return new SessionCoordinator((credentials) => client.createSession(credentials), {
      maxLoginAttempts: options.maxLoginAttempts ?? 1,
      scheduler: this.scheduler,
      acceptsUser: options.acceptsUser,
    });
  }

  /** The controller an app builds for a signed-in user, loaded from the (shared) store. */
  async startController(
    app: { client: ApiClient; clock: ServerClock; session: SessionCoordinator; gate: PaymentGate },
    user: User,
    options: { polling?: PollingOptions; newKey?: () => string; store?: MemoryIntentStore } = {},
  ): Promise<IntentController> {
    const controller = new IntentController({
      scope: { candidateId: CANDIDATE_ID, userId: user.id },
      role: user.role,
      api: createScopedApi(app.client, app.session, user.id),
      store: options.store ?? this.store,
      clock: app.clock,
      scheduler: this.scheduler,
      newKey: options.newKey ?? (() => `key-${(this.keySequence += 1)}`),
      gate: app.gate,
      polling: options.polling,
    });
    await controller.load();
    return controller;
  }
}
