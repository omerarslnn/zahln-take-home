import type { Scheduler } from './scheduler';

export interface PollingOptions {
  /** Delays between polling rounds in milliseconds; the last one repeats. */
  backoffMs?: readonly number[];
  /** How long one key is polled before polling stops for it. */
  budgetMs?: number;
}

export type PollState = 'idle' | 'polling' | 'paused' | 'stopped';

const DEFAULT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 10_000] as const;
const DEFAULT_BUDGET_MS = 3 * 60_000;

/**
 * Bounded, non-overlapping polling for a set of keys: one timer for all of them, and a round never
 * starts while the previous one is still running. When a key's budget runs out, polling stops for it;
 * its resource stays pending or unknown, because running out of time proves nothing.
 * `setActive(false)` pauses (app in the background); `setActive(true)` resumes with fresh budgets
 * and polls immediately, so a returning screen shows current state.
 */
export class Poller {
  private readonly deadlines = new Map<string, number>();
  private readonly stopped = new Set<string>();
  private readonly backoff: readonly number[];
  private readonly budget: number;
  private cancelTimer: (() => void) | null = null;
  private running = false;
  private active = true;
  private round = 0;

  constructor(
    private readonly scheduler: Scheduler,
    private readonly poll: (keys: string[]) => Promise<void>,
    private readonly onChange: () => void,
    options: PollingOptions = {},
  ) {
    this.backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.budget = options.budgetMs ?? DEFAULT_BUDGET_MS;
  }

  track(key: string): void {
    this.deadlines.set(key, this.scheduler.now() + this.budget);
    this.stopped.delete(key);
    this.round = 0;
    this.cancel();
    this.schedule();
  }

  untrack(key: string): void {
    this.deadlines.delete(key);
    this.stopped.delete(key);
  }

  state(key: string): PollState {
    if (this.stopped.has(key)) return 'stopped';
    if (!this.deadlines.has(key)) return 'idle';
    return this.active ? 'polling' : 'paused';
  }

  setActive(active: boolean): void {
    this.active = active;
    this.cancel();
    if (active) {
      const deadline = this.scheduler.now() + this.budget;
      for (const key of [...this.deadlines.keys(), ...this.stopped]) {
        this.deadlines.set(key, deadline);
      }
      this.stopped.clear();
      this.round = 0;
      this.schedule(0);
    }
    this.onChange();
  }

  stop(): void {
    this.cancel();
    this.deadlines.clear();
    this.stopped.clear();
  }

  private schedule(delay?: number): void {
    if (!this.active || this.running || this.cancelTimer || this.deadlines.size === 0) return;
    const wait = delay ?? this.backoff[Math.min(this.round, this.backoff.length - 1)] ?? 10_000;
    this.cancelTimer = this.scheduler.setTimer(() => {
      this.cancelTimer = null;
      return this.runRound();
    }, wait);
  }

  private async runRound(): Promise<void> {
    const now = this.scheduler.now();
    for (const [key, deadline] of this.deadlines) {
      if (now >= deadline) {
        this.deadlines.delete(key);
        this.stopped.add(key);
      }
    }
    this.running = true;
    try {
      await this.poll([...this.deadlines.keys()]);
    } finally {
      this.running = false;
    }
    this.round += 1;
    this.onChange();
    this.schedule();
  }

  private cancel(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }
}
