import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NO_FILTER } from './finance/filters';
import { parseRoute, routeHref, type Route } from './routing';

describe('hash routes', () => {
  it('read back what they write', () => {
    const routes: Route[] = [
      { page: 'report', day: '2026-10-25' },
      { page: 'report', day: null },
      { page: 'attention' },
      { page: 'transactions', filter: { ...NO_FILTER, status: 'pending', q: 'pay_7' } },
      { page: 'payment', paymentId: 'pay_650a13b0311ad6fe', back: '#/transactions?status=pending' },
      { page: 'diagnostics' },
    ];
    for (const route of routes) assert.deepEqual(parseRoute(routeHref(route)), route);
  });

  it('open the daily report by default and refuse unknown or malformed paths', () => {
    assert.deepEqual(parseRoute(''), { page: 'report', day: null });
    assert.deepEqual(parseRoute('#/report?day=2026-02-30'), { page: 'report', day: null });
    assert.deepEqual(parseRoute('#/payments/<script>'), { page: 'not_found' });
    assert.deepEqual(parseRoute('#/payments/pay_1/extra'), { page: 'not_found' });
    assert.deepEqual(parseRoute('#/nowhere'), { page: 'not_found' });
  });

  it('accept only an in-app route to go back to', () => {
    const route = parseRoute('#/payments/pay_1?back=https%3A%2F%2Fevil.example');
    assert.deepEqual(route, { page: 'payment', paymentId: 'pay_1', back: null });
  });
});
