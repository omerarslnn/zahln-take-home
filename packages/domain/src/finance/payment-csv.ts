import type { Payment } from '@mensa/api';

/**
 * The export's columns, in this order. One row per payment with its refund summary; the event
 * history of a payment is on its detail page. Money is raw integer cents, times are the server's
 * ISO 8601 timestamps (UTC), so no column depends on the reader's language or time zone. Payer
 * names are left out on purpose: the payer ID identifies the payment, a name adds nothing a finance
 * export needs.
 */
export const PAYMENT_CSV_COLUMNS = [
  'payment_id',
  'order_id',
  'created_at',
  'updated_at',
  'status',
  'currency',
  'amount_cents',
  'refunded_cents',
  'pending_refund_cents',
  'refundable_cents',
  'price_group',
  'payer_id',
  'mensa_id',
  'mensa_name',
  'till_id',
  'till_name',
  'needs_attention',
  'attention_reasons',
  'version',
] as const;

/** Lets spreadsheet software detect UTF-8, so "Müller" does not turn into "MÃ¼ller". */
const BYTE_ORDER_MARK = '﻿';

/** RFC 4180 CSV: comma-separated, CRLF line ends, a header row, UTF-8 with a byte order mark. */
export function paymentsToCsv(payments: readonly Payment[]): string {
  const rows = [PAYMENT_CSV_COLUMNS.map(csvText), ...payments.map(paymentRow)];
  return BYTE_ORDER_MARK + rows.map((cells) => cells.join(',')).join('\r\n') + '\r\n';
}

function paymentRow(payment: Payment): string[] {
  return [
    csvText(payment.id),
    csvText(payment.orderId),
    csvText(payment.createdAt),
    csvText(payment.updatedAt),
    csvText(payment.status),
    csvText(payment.currency ?? 'EUR'),
    csvInteger(payment.amountCents),
    csvInteger(payment.refundedAmountCents),
    csvInteger(payment.pendingRefundAmountCents),
    csvInteger(payment.refundableAmountCents),
    csvText(payment.priceGroup),
    csvText(payment.payer.id),
    csvText(payment.mensa.id),
    csvText(payment.mensa.name),
    csvText(payment.till.id),
    csvText(payment.till.name),
    payment.needsAttention ? 'true' : 'false',
    csvText(payment.attentionReasons.join('|')),
    csvInteger(payment.version),
  ];
}

/** A number column: only a safe integer is written, never an arbitrary string. */
export function csvInteger(value: number): string {
  if (!Number.isSafeInteger(value)) throw new RangeError('A CSV number column needs an integer');
  return String(value);
}

// Spreadsheets run a cell that starts with one of these as a formula ("CSV injection"), including
// the full-width forms some of them accept.
const FORMULA_START = /^[=+\-@\t\r\n＝＋－＠]/;

/**
 * A text column from untrusted data (server names and IDs). Quoting alone does not stop a
 * spreadsheet from running "=HYPERLINK(…)": text that starts like a formula gets a leading
 * apostrophe, which spreadsheets show as text. Then RFC 4180 quoting: a value with a comma, a
 * quote or a line break (and every neutralised value) goes in double quotes, inner quotes doubled.
 */
export function csvText(value: string): string {
  const neutralised = FORMULA_START.test(value);
  const text = neutralised ? `'${value}` : value;
  return neutralised || /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
