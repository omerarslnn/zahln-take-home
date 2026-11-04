import type { Role, User } from '@mensa/api';
import type { SeededAccount, SessionCoordinator, SignInResult } from './session';

/** The accounts the student app serves: the payer roles (each has a price group). */
export const PAYER_ROLES: readonly Role[] = ['student', 'staff', 'guest'];
/** The accounts the till serves. */
export const CASHIER_ROLES: readonly Role[] = ['cashier'];

/** A `SessionCoordinator` policy that accepts exactly these roles. */
export function acceptsRoles(roles: readonly Role[]): (user: User) => boolean {
  return (user) => roles.includes(user.role);
}

/** Which required fields were left empty. */
export interface MissingFields {
  username: boolean;
  password: boolean;
}

/**
 * Checks what the user typed before anything is sent. Both fields are required (the contract's
 * LoginRequest: 1 to 100 characters; the fields themselves stop at 100). The username is trimmed,
 * because keyboards and autofill add trailing spaces; the password is sent exactly as typed.
 */
export function checkCredentials(
  username: string,
  password: string,
): { ok: true; credentials: SeededAccount } | { ok: false; missing: MissingFields } {
  const trimmed = username.trim();
  if (trimmed && password) return { ok: true, credentials: { username: trimmed, password } };
  return { ok: false, missing: { username: !trimmed, password: !password } };
}

/**
 * A sign-in attempt's outcome. Besides the coordinator's results: `missing_input` (nothing was
 * sent), `in_progress` (another attempt is running; this one sent nothing) and `demo_unavailable`
 * (the build has no published demo password).
 */
export type SignInAttempt =
  | SignInResult
  | { ok: false; reason: 'missing_input'; missing: MissingFields }
  | { ok: false; reason: 'in_progress' }
  | { ok: false; reason: 'demo_unavailable' };

/**
 * The one way an app signs in. Typed credentials and one-tap demo accounts end in the same
 * `SessionCoordinator.signIn`, so they share its role check, its generations (a late answer for a
 * replaced attempt is never used) and its 5-minute re-login. One attempt at a time: a second
 * submit or tap while one runs is answered `in_progress` and sends nothing.
 */
export class SignInFlow {
  private running = false;

  constructor(
    private readonly session: SessionCoordinator,
    /** The mock's published test password for the demo accounts; null when the build has none. */
    private readonly demoPassword: string | null,
  ) {}

  /** Signs in with what the user typed. */
  submit(username: string, password: string): Promise<SignInAttempt> {
    if (this.running) return Promise.resolve({ ok: false, reason: 'in_progress' });
    const checked = checkCredentials(username, password);
    if (!checked.ok) {
      return Promise.resolve({ ok: false, reason: 'missing_input', missing: checked.missing });
    }
    return this.run(checked.credentials);
  }

  /** Signs a published demo account in with the published test password. */
  signInDemo(username: string): Promise<SignInAttempt> {
    if (this.running) return Promise.resolve({ ok: false, reason: 'in_progress' });
    if (!this.demoPassword) return Promise.resolve({ ok: false, reason: 'demo_unavailable' });
    return this.run({ username, password: this.demoPassword });
  }

  private async run(credentials: SeededAccount): Promise<SignInAttempt> {
    this.running = true;
    try {
      return await this.session.signIn(credentials);
    } finally {
      this.running = false;
    }
  }
}
