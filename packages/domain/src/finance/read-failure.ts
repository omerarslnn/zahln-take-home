import type { CallResult } from '../session';

/** Why a finance read has no usable result, in terms a screen can explain. */
export type ReadFailure =
  | 'offline'
  | 'session'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'invalid_response'
  | 'unavailable';

export function readFailureOf(
  result: Exclude<CallResult<unknown>, { kind: 'success' }>,
): ReadFailure {
  switch (result.kind) {
    case 'no_response':
      return 'offline';
    case 'session_unavailable':
    case 'no_session':
    case 'account_changed':
      return 'session';
    case 'invalid_response':
      return 'invalid_response';
    case 'problem':
      switch (result.problem.code) {
        case 'forbidden':
        case 'unknown_candidate':
          return 'forbidden';
        case 'not_found':
          return 'not_found';
        case 'invalid_request':
          return 'invalid_request';
        default:
          return 'unavailable';
      }
  }
}
