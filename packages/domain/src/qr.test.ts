import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOrderCode, parseOrderQr } from './qr';

describe('parseOrderQr', () => {
  it('accepts the observed format and extracts the order ID', () => {
    assert.deepEqual(parseOrderQr('zahln://pay?order=ord_0a1b2c3d4e5f6a7b'), {
      ok: true,
      orderId: 'ord_0a1b2c3d4e5f6a7b',
    });
    // Scanners may add a trailing newline; scheme and host are case-insensitive.
    assert.equal(parseOrderQr('ZAHLN://PAY?order=ord_1\n').ok, true);
  });

  it('rejects any other envelope, so a scanned URL is never followed', () => {
    for (const scanned of [
      'https://dev.zahln.de/pay?order=ord_1',
      'https://evil.example/pay?order=ord_1',
      'zahln://evil?order=ord_1',
      'zahln://pay/extra?order=ord_1',
      'zahln://user@pay?order=ord_1',
      'zahln://pay:443?order=ord_1',
      'zahln://pay?order=ord_1&amount=1',
      'zahln://pay?order=ord_1#fragment',
      'zahln://pay?ord=ord_1',
      'ord_1',
      '',
    ]) {
      assert.deepEqual(parseOrderQr(scanned), { ok: false, reason: 'not_an_order_code' }, scanned);
    }
  });

  it('rejects order IDs outside a safe, bounded alphabet', () => {
    for (const id of ['', 'ord%2F1', 'ord/1', 'ord 1', 'x'.repeat(65)]) {
      assert.equal(parseOrderQr(`zahln://pay?order=${id}`).ok, false, id);
    }
  });

  it('accepts a typed order code as the QR text or the bare ID, and nothing else', () => {
    assert.deepEqual(parseOrderCode(' ord_0a1b2c3d4e5f6a7b '), {
      ok: true,
      orderId: 'ord_0a1b2c3d4e5f6a7b',
    });
    assert.deepEqual(parseOrderCode('zahln://pay?order=ord_x'), { ok: true, orderId: 'ord_x' });
    assert.equal(parseOrderCode('https://evil.test/?order=ord_x').ok, false);
    assert.equal(parseOrderCode('ord x').ok, false);
    assert.equal(parseOrderCode('').ok, false);
  });
});
