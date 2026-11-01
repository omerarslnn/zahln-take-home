/**
 * What the platform's local authentication returned, mapped by the app's adapter (Expo
 * LocalAuthentication). `not_enrolled`: the device has no screen lock or biometric set up.
 */
export type LocalAuthResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'not_enrolled' | 'locked_out' | 'unavailable' | 'failed' };

/**
 * What one confirmation is bound to: who pays, which order, which amount, and which review of it.
 * The review screen changes `reviewId` whenever it shows a different order state, so an
 * authorization given for one review cannot be spent on another.
 */
export interface PaymentBinding {
  userId: string;
  orderId: string;
  amountCents: number;
  reviewId: number;
}

export type AuthorizedOutcome<T> =
  | { type: 'done'; result: T }
  /** A prompt or submission is already running; this tap did nothing. */
  | { type: 'busy' }
  /** The user cancelled or could not authenticate. Nothing was sent. */
  | { type: 'not_authorized'; reason: Exclude<LocalAuthResult, { ok: true }>['reason'] }
  /** The account, screen, order or amount changed during the prompt. Nothing was sent. */
  | { type: 'invalidated' };

/**
 * Local authorization in front of a payment write: a new payment, or the same-key resend of an
 * unknown one (which may create it). One per screen.
 *
 * This is a device-side gate. The mock API takes only a bearer token for `POST …/payments`; it
 * cannot verify that the prompt happened. Production would need server-verifiable proof, such as a
 * device-bound key signing a server challenge.
 */
export class PaymentAuthorizer {
  private running = false;

  constructor(private readonly currentUserId: () => string | null) {}

  get busy(): boolean {
    return this.running;
  }

  /**
   * Asks the user to authenticate, then runs `send` only if everything the confirmation was bound to
   * still holds. The lock is taken synchronously, before anything awaits, so a double tap cannot
   * open two prompts or send twice. A cancelled or failed prompt sends nothing.
   *
   * @param binding what the user saw when they tapped
   * @param current what the screen shows now (null once it left), read after the prompt
   */
  async run<T>(request: {
    binding: PaymentBinding;
    authenticate: () => Promise<LocalAuthResult>;
    current: () => PaymentBinding | null;
    send: () => Promise<T>;
  }): Promise<AuthorizedOutcome<T>> {
    if (this.running) return { type: 'busy' };
    this.running = true;
    try {
      const auth = await request.authenticate();
      if (!auth.ok) return { type: 'not_authorized', reason: auth.reason };
      // The prompt can take a while, and the system sheet itself may make the app briefly inactive;
      // that is not a reason to refuse. A different account, order, amount or screen is.
      const { binding } = request;
      if (this.currentUserId() !== binding.userId || !sameBinding(request.current(), binding)) {
        return { type: 'invalidated' };
      }
      return { type: 'done', result: await request.send() };
    } finally {
      this.running = false;
    }
  }
}

function sameBinding(now: PaymentBinding | null, then: PaymentBinding): boolean {
  return (
    now !== null &&
    now.userId === then.userId &&
    now.orderId === then.orderId &&
    now.amountCents === then.amountCents &&
    now.reviewId === then.reviewId
  );
}
