// The payment history as the screen shows it, as pure functions: sections by Berlin calendar day
// and the words of each row. Everything comes from the server's payments and this phone's saved
// actions; nothing is computed from amounts.
import type { Payment } from '@mensa/api';
import type { HistoryEntry } from '@mensa/domain';
import {
  addCalendarDays,
  berlinDateKey,
  formatBerlinClock,
  formatCents,
  type Locale,
  type MessageKey,
  type MessageParams,
} from '@mensa/shared';
import { paymentStatusText } from './components/payment-text';
import type { Tone } from './components/ui';

export type SectionTitle =
  { kind: 'attention' } | { kind: 'today' } | { kind: 'yesterday' } | { kind: 'day'; day: string };

export interface HistorySection {
  key: string;
  title: SectionTitle;
  data: HistoryEntry[];
}

/**
 * Unfinished payment actions first (they need the payer), then the server's payments grouped by
 * their Berlin calendar day, in the order they arrived (newest first). `today` is the Berlin day
 * of "now" (YYYY-MM-DD), so a payment at 00:30 in Berlin counts for that day, not the UTC one.
 */
export function historySections(rows: readonly HistoryEntry[], today: string): HistorySection[] {
  const attention = rows.filter((row) => row.kind === 'unresolved');
  const days = new Map<string, HistoryEntry[]>();
  for (const row of rows) {
    if (row.kind !== 'payment') continue;
    const day = berlinDateKey(row.payment.createdAt);
    days.set(day, [...(days.get(day) ?? []), row]);
  }
  const yesterday = addCalendarDays(today, -1);
  const byDay = [...days].map(([day, data]): HistorySection => ({
    key: day,
    title:
      day === today
        ? { kind: 'today' }
        : day === yesterday
          ? { kind: 'yesterday' }
          : { kind: 'day', day },
    data,
  }));
  return attention.length > 0
    ? [{ key: 'attention', title: { kind: 'attention' }, data: attention }, ...byDay]
    : byDay;
}

type Translate = (key: MessageKey, params?: MessageParams) => string;

export interface RowText {
  title: string;
  status: { tone: Tone; label: string };
  value: string;
  subtitle: string;
}

/**
 * A server payment as a history row: the mensa, the server's status in words, the amount, and the
 * Berlin time, till and any refund (completed or still being processed) as the subtitle. Screen
 * readers hear these parts in this order, status included.
 */
export function paymentRowText(payment: Payment, t: Translate, locale: Locale): RowText {
  const status = paymentStatusText(payment.status);
  const notes = [
    formatBerlinClock(payment.createdAt, locale),
    payment.till.name,
    payment.refundedAmountCents > 0
      ? t('history.refunded', { amount: formatCents(payment.refundedAmountCents, locale) })
      : null,
    payment.pendingRefundAmountCents > 0
      ? t('history.refundPending', {
          amount: formatCents(payment.pendingRefundAmountCents, locale),
        })
      : null,
  ];
  return {
    title: payment.mensa.name,
    status: { tone: status.tone, label: t(status.key) },
    value: formatCents(payment.amountCents, locale),
    subtitle: notes.filter(Boolean).join(' · '),
  };
}
