import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addItem,
  canAdd,
  MAX_BASKET_LINES,
  MAX_LINE_QUANTITY,
  removeItem,
  type Basket,
} from './basket';
import { parseOrderQr } from './qr';
import { ScanLock } from './scan-lock';

describe('ScanLock', () => {
  it('lets one of many identical scanner callbacks through until released', () => {
    const lock = new ScanLock();
    const scanned = 'zahln://pay?order=ord_0a1b2c3d4e5f6a7b';
    const handled: string[] = [];
    const onBarcode = (data: string) => {
      if (!lock.tryAcquire()) return; // taken synchronously, before any async work
      const parsed = parseOrderQr(data);
      if (parsed.ok) handled.push(parsed.orderId);
    };
    for (let frame = 0; frame < 5; frame += 1) onBarcode(scanned);
    assert.deepEqual(handled, ['ord_0a1b2c3d4e5f6a7b']);
    lock.release(); // the user chose to scan again
    onBarcode(scanned);
    assert.equal(handled.length, 2);
  });
});

describe('basket', () => {
  it('counts quantities and removes a line at zero', () => {
    let basket: Basket = [];
    basket = addItem(addItem(addItem(basket, 'itm_a'), 'itm_a'), 'itm_b');
    assert.deepEqual(basket, [
      { itemId: 'itm_a', quantity: 2 },
      { itemId: 'itm_b', quantity: 1 },
    ]);
    basket = removeItem(removeItem(basket, 'itm_b'), 'itm_a');
    assert.deepEqual(basket, [{ itemId: 'itm_a', quantity: 1 }]);
  });

  it('keeps to the contract limits: 20 per line and 20 lines', () => {
    let line: Basket = [];
    for (let tap = 0; tap < 25; tap += 1) line = addItem(line, 'itm_a');
    assert.deepEqual(line, [{ itemId: 'itm_a', quantity: MAX_LINE_QUANTITY }]);
    assert.equal(canAdd(line, 'itm_a'), false);

    let lines: Basket = [];
    for (let item = 0; item < 25; item += 1) lines = addItem(lines, `itm_${item}`);
    assert.equal(lines.length, MAX_BASKET_LINES);
    assert.equal(canAdd(lines, 'itm_new'), false);
    assert.equal(canAdd(lines, 'itm_0'), true); // an existing line can still grow
  });
});
