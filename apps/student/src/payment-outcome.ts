// What a payer may be told about their payment action, in words. The rule behind it is
// `paymentDisplay` in @mensa/domain: only a server-confirmed payment is ever shown as paid; an
// action the server has not answered is "checking", never "failed" or "declined".
import { paymentDisplay, type NotAllowedReason, type PayOrderIntent } from '@mensa/domain';
import type { MessageKey } from '@mensa/shared';
import type { Tone } from './components/ui';

export interface OutcomeText {
  tone: Tone;
  title: MessageKey;
  body: MessageKey;
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
