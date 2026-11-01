import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { payment } from '../testing/finance-fixtures';
import { csvInteger, csvText, PAYMENT_CSV_COLUMNS, paymentsToCsv } from './payment-csv';

/** A small RFC 4180 reader, to check that each written row reads back as the right fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[index + 1] === '\n') {
      row.push(field);
      rows.push(row);
      [row, field] = [[], ''];
      index += 1;
    } else field += char;
  }
  return rows;
}

describe('paymentsToCsv', () => {
  it('writes the documented header, then one row per payment with raw cents and ISO times', () => {
    const csv = paymentsToCsv([
      payment({
        id: 'pay_1',
        amountCents: 580,
        refundedAmountCents: 100,
        pendingRefundAmountCents: 80,
        refundableAmountCents: 400,
        needsAttention: true,
        attentionReasons: ['refund_pending_too_long', 'refund_failed'],
        createdAt: '2026-11-01T10:53:01.000Z',
      }),
    ]);
    assert.ok(csv.startsWith('﻿'));
    assert.ok(csv.endsWith('\r\n'));
    const [header, row] = parseCsv(csv.slice(1));
    assert.deepEqual(header, [...PAYMENT_CSV_COLUMNS]);
    const field = (name: (typeof PAYMENT_CSV_COLUMNS)[number]) =>
      row?.[PAYMENT_CSV_COLUMNS.indexOf(name)];
    assert.deepEqual(
      [
        field('payment_id'),
        field('created_at'),
        field('amount_cents'),
        field('refunded_cents'),
        field('pending_refund_cents'),
        field('refundable_cents'),
        field('needs_attention'),
        field('attention_reasons'),
        field('currency'),
      ],
      [
        'pay_1',
        '2026-11-01T10:53:01.000Z',
        '580',
        '100',
        '80',
        '400',
        'true',
        'refund_pending_too_long|refund_failed',
        'EUR',
      ],
    );
  });

  it('quotes commas, quotes and line breaks, and keeps German umlauts', () => {
    const tricky = 'Mensa "Nord", Haus 2\nEingang Süd';
    const csv = paymentsToCsv([
      payment({
        mensa: { id: 'mensa_nord', name: tricky },
        till: { id: 't1', name: 'Kasse Müller-Straße' },
      }),
    ]);
    const rows = parseCsv(csv.slice(1));
    assert.equal(rows.length, 2);
    assert.equal(rows[1]?.length, PAYMENT_CSV_COLUMNS.length);
    assert.equal(rows[1]?.[PAYMENT_CSV_COLUMNS.indexOf('mensa_name')], tricky);
    assert.equal(rows[1]?.[PAYMENT_CSV_COLUMNS.indexOf('till_name')], 'Kasse Müller-Straße');
  });

  it('neutralises text that a spreadsheet would run as a formula', () => {
    for (const hostile of [
      '=HYPERLINK("https://example.test","x")',
      '+49 30 1',
      '-2+3',
      '@SUM(A1)',
      '\t=1',
      '\r=1',
      '＝1+1',
    ]) {
      const cell = csvText(hostile);
      assert.ok(cell.startsWith(`"'`), JSON.stringify(cell));
      assert.equal(parseCsv(`${cell}\r\n`)[0]?.[0], `'${hostile}`);
    }
    const csv = paymentsToCsv([payment({ payer: { id: '=cmd|"/c calc"!A1', displayName: 'x' } })]);
    assert.equal(
      parseCsv(csv.slice(1))[1]?.[PAYMENT_CSV_COLUMNS.indexOf('payer_id')],
      `'=cmd|"/c calc"!A1`,
    );
    assert.equal(csvText('Mensa am Campus'), 'Mensa am Campus');
    assert.equal(csvText('2026-10-29T11:00:00.000Z'), '2026-10-29T11:00:00.000Z');
  });

  it('writes number columns only from integers', () => {
    assert.equal(csvInteger(340), '340');
    assert.equal(csvInteger(-270), '-270'); // a number, not text: never neutralised
    assert.throws(() => csvInteger(3.5), RangeError);
    assert.throws(() => csvInteger(Number.NaN), RangeError);
    assert.throws(() => paymentsToCsv([payment({ amountCents: 1.5 })]), RangeError);
  });

  it('contains no session or credential fields', () => {
    assert.equal(
      PAYMENT_CSV_COLUMNS.some((column) => /token|password|secret/.test(column)),
      false,
    );
  });
});
