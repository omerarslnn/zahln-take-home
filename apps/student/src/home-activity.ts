// What Home lists from the payment actions saved on this phone, as pure functions. Only real
// records: nothing is invented, and nothing is read from the server just to fill the screen.
import { isFinal, type IntentRecord, type PayOrderIntent } from '@mensa/domain';

/** Final results shown on Home until dismissed; the full list is the payment history. */
export const RECENT_LIMIT = 3;

export interface HomeActivity {
  /** Payments without a final answer (being sent, unknown, not sent, being checked): first. */
  attention: PayOrderIntent[];
  /** Final results (paid, declined, not paid) the payer has not dismissed yet, newest first. */
  recent: PayOrderIntent[];
}

/** Newest first by the server time of the last attempt; never-sent actions last. */
const newestFirst = (a: PayOrderIntent, b: PayOrderIntent) =>
  (b.lastSentAt ?? b.firstSentAt ?? 0) - (a.lastSentAt ?? a.firstSentAt ?? 0);

/**
 * Splits the saved payment actions into those that still need the payer (always all of them, so an
 * unresolved payment can never be pushed out of sight) and recent final results (at most
 * RECENT_LIMIT). Orders and refunds are the till's; they never appear here.
 */
export function homeActivity(records: readonly IntentRecord[]): HomeActivity {
  const payments = records.filter((record): record is PayOrderIntent => record.kind === 'payOrder');
  return {
    attention: payments.filter((record) => !isFinal(record)).sort(newestFirst),
    recent: payments
      .filter((record) => isFinal(record))
      .sort(newestFirst)
      .slice(0, RECENT_LIMIT),
  };
}
