import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MenuItem } from '@mensa/api';
import { addItem, MAX_LINE_QUANTITY } from '@mensa/domain';
import { basketCount, basketLines, keepAwakeWanted, qrSide } from './till-rules';

const PASTA: MenuItem = {
  id: 'itm_pasta',
  name: { de: 'Pasta mit Tomatensauce', en: 'Pasta with tomato sauce' },
  prices: { student: 220, staff: 380, guest: 490 },
};

describe('keepAwakeWanted', () => {
  it('keeps the screen on only while a shown order can still be paid', () => {
    const shown = { focused: true, appActive: true };
    assert.equal(keepAwakeWanted({ ...shown, status: 'open' }), true);
    assert.equal(keepAwakeWanted({ ...shown, status: 'paying' }), true);
    for (const status of ['paid', 'expired', null] as const) {
      assert.equal(keepAwakeWanted({ ...shown, status }), false, String(status));
    }
  });

  it('lets the device sleep in the background or behind another screen', () => {
    assert.equal(keepAwakeWanted({ focused: false, appActive: true, status: 'open' }), false);
    assert.equal(keepAwakeWanted({ focused: true, appActive: false, status: 'open' }), false);
  });
});

describe('qrSide', () => {
  it('fills the space within limits that scan well', () => {
    assert.equal(qrSide(700, true), 560);
    assert.equal(qrSide(480.6, true), 480);
    assert.equal(qrSide(700, false), 420);
    assert.equal(qrSide(120, false), 200);
  });
});

describe('basket summary', () => {
  it('counts dishes and names lines without any amount', () => {
    let basket = addItem([], PASTA.id);
    basket = addItem(basket, PASTA.id);
    basket = addItem(basket, 'itm_unknown');
    assert.equal(basketCount(basket), 3);
    assert.deepEqual(basketLines(basket, [PASTA], 'de'), [
      { itemId: 'itm_pasta', name: 'Pasta mit Tomatensauce', quantity: 2 },
      { itemId: 'itm_unknown', name: 'itm_unknown', quantity: 1 },
    ]);
    assert.ok(MAX_LINE_QUANTITY >= 2);
  });
});
