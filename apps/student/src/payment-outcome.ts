// What a payer may be told about their payment action, in words. The rule behind it is
// `paymentDisplay` in @mensa/domain: only a server-confirmed payment is ever shown as paid; an
// action the server has not answered is "checking", never "failed" or "declined".
import {
  paymentDisplay,
  type AuthorizedOutcome,
  type NotAllowedReason,
  type PayOrderIntent,
  type RetryOutcome,
  type StartOutcome,
} from '@mensa/domain';
import type { MessageKey } from '@mensa/shared';
import type { Tone } from './components/ui';

export interface OutcomeText {
  tone: Tone;
  title: MessageKey;
  body: MessageKey;
}

/** A message a screen keeps after an action, until the next one. */
export interface ScreenMessage {
  tone: Tone;
  key: MessageKey;
}

export type AfterPayAttempt =
  /** Sent now or earlier: the result screen follows this payment. */
  { type: 'show_result'; key: string } | { type: 'message'; message: ScreenMessage | null };

/**
 * What the review screen does after a pay attempt. A blocked attempt keeps no message: the live
 * availability notice already says why, and a copy would outlive it once payments are available
 * again (BUG-01). Every other reason nothing was sent stays visible until the next attempt.
 */
export function afterPayAttempt(outcome: AuthorizedOutcome<StartOutcome>): AfterPayAttempt {
  switch (outcome.type) {
    case 'busy':
      return { type: 'message', message: null };
    case 'not_authorized':
      return kept(outcome.reason === 'cancelled' ? 'neutral' : 'error', `auth.${outcome.reason}`);
    case 'invalidated':
      return kept('warning', 'review.changed');
    case 'done':
      return afterStart(outcome.result);
  }
}

function afterStart(started: StartOutcome): AfterPayAttempt {
  switch (started.type) {
    case 'submitted':
    case 'existing':
      return { type: 'show_result', key: started.intent.key };
    case 'conflict':
      return kept('warning', 'review.conflict');
    case 'blocked':
      return { type: 'message', message: null };
    case 'not_allowed':
      return kept('error', notAllowedText(started.reason));
    case 'storage_failed':
      return kept('error', 'review.storageFailed');
  }
}

function kept(tone: Tone, key: MessageKey): AfterPayAttempt {
  return { type: 'message', message: { tone, key } };
}

/**
 * What the result screen keeps saying after "send again". A blocked resend keeps nothing: the live
 * availability notice says why, and the button waits until payments are available (BUG-01).
 */
export function afterResend(outcome: AuthorizedOutcome<RetryOutcome>): MessageKey | null {
  if (outcome.type === 'not_authorized') return `auth.${outcome.reason}`;
  if (outcome.type === 'invalidated') return 'result.sendInvalidated';
  if (outcome.type !== 'done') return null;
  const retried = outcome.result;
  if (retried.type === 'replay_not_allowed') return `result.replay.${retried.reason}`;
  if (retried.type === 'storage_failed') return 'review.storageFailed';
  return null;
}

export function describeOutcome(record: PayOrderIntent): OutcomeText {
  switch (paymentDisplay(record)) {
    case 'confirmed':
      return { tone: 'ok', title: 'result.confirmed.title', body: 'result.confirmed.body' };
    case 'declined':
      return { tone: 'error', title: 'result.declined.title', body: 'result.declined.body' };
    case 'pending':
      return { tone: 'pending', title: 'result.pending.title', body: 'result.pending.body' };
    case 'checking':
      return { tone: 'warning', title: 'result.checking.title', body: 'result.checking.body' };
    case 'sending':
      return { tone: 'pending', title: 'result.sending.title', body: 'result.sending.body' };
    case 'not_sent':
      return { tone: 'neutral', title: 'result.notSent.title', body: 'result.notSent.body' };
    case 'refused':
      return {
        tone: record.refusal === 'order_paid_by_other' ? 'neutral' : 'error',
        title: 'result.refused.title',
        body: refusalText(record.refusal),
      };
  }
}

/** The server's documented refusal codes, in words; anything else gets a general sentence. */
export function refusalText(code: string | null): MessageKey {
  switch (code) {
    case 'order_paid_by_other':
      return 'refusal.paidByOther';
    case 'order_expired':
      return 'refusal.orderExpired';
    case 'order_already_paid':
      return 'refusal.alreadyPaid';
    case 'order_payment_in_progress':
      return 'refusal.inProgress';
    case 'amount_mismatch':
      return 'refusal.amountMismatch';
    case 'payments_disabled':
      return 'refusal.paused';
    case 'app_version_unsupported':
      return 'refusal.update';
    case 'session_unavailable':
    case 'no_session':
    case 'session_expired':
    case 'unauthorized':
      return 'refusal.session';
    case 'unavailable':
      return 'refusal.unavailable';
    default:
      return 'refusal.other';
  }
}

export function notAllowedText(reason: NotAllowedReason): MessageKey {
  switch (reason) {
    case 'server_time_unknown':
      return 'notAllowed.serverTime';
    case 'unreadable_records':
      return 'notAllowed.unreadable';
    case 'already_paid':
      return 'refusal.alreadyPaid';
    default:
      return 'notAllowed.other';
  }
}
