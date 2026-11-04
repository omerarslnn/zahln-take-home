// Sign-in outcomes in words. The student app has an identical copy, with the tests.
import type { MissingFields, SignInAttempt } from '@mensa/domain';
import type { MessageKey } from '@mensa/shared';

/** Why a sign-in produced no session, as the screens receive it. */
export type SignInFailure = Exclude<SignInAttempt, { ok: true }>['reason'] | 'not_configured';

/**
 * The message for a failed sign-in, or null when there is nothing to report: a newer attempt or a
 * sign-out replaced it, another attempt is still running, or the fields say what is missing.
 * Invalid credentials, no connection, a server without an answer and a missing configuration each
 * have their own message, because each asks the user to do something different.
 */
export function signInFailureText(
  reason: SignInFailure,
  app: 'student' | 'till',
): MessageKey | null {
  switch (reason) {
    case 'invalid_credentials':
      return 'signIn.failure.invalid_credentials';
    case 'no_connection':
      return 'signIn.failure.no_connection';
    case 'login_unavailable':
      return 'signIn.failure.login_unavailable';
    case 'wrong_role':
      return app === 'student'
        ? 'signIn.failure.wrong_role.student'
        : 'signIn.failure.wrong_role.till';
    case 'demo_unavailable':
      return 'signIn.failure.demo_unavailable';
    case 'not_configured':
      return 'signIn.failure.not_configured';
    case 'missing_input':
    case 'in_progress':
    case 'superseded':
      return null;
  }
}

/** The error under each empty required field. */
export function missingFieldText(missing: MissingFields | null): {
  username: MessageKey | null;
  password: MessageKey | null;
} {
  return {
    username: missing?.username ? 'signIn.missing.username' : null,
    password: missing?.password ? 'signIn.missing.password' : null,
  };
}
