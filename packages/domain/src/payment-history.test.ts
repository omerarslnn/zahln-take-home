import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeHistory, PaymentHistory } from './payment-history';
import { createScopedApi } from './session';
import { TestEnvironment } from './testing/harness';

const PASTA = [{ itemId: 'itm_pasta', quantity: 1 }];

async function payerWithPayments(count: number) {
  const env = new TestEnvironment();
  const app = await env.startApp('student');
  for (let index = 0; index < count; index += 1) {
    await app.controller.payOrder(env.server.seedOrder(PASTA), 500);
  }
  const api = createScopedApi(app.client, app.session, app.user.id);
  return { env, app, api };
}

describe('PaymentHistory', () => {
  it('loads further pages only when asked, and says when the list is complete', async () => {
    const { app, api } = await payerWithPayments(5);
    const history = new PaymentHistory(
      (query) => api.listPayments(query),
      app.controller.cache,
      {},
      2,
    );

    await history.refresh();
    assert.deepEqual([history.state().ids.length, history.state().hasMore], [2, true]);
    await history.loadMore();
    await history.loadMore();
    assert.deepEqual([history.state().ids.length, history.state().hasMore], [5, false]);
    assert.equal(new Set(history.state().ids).size, 5);
  });

  it('drops a late page from an earlier load after a refresh', async () => {
    const { env, app, api } = await payerWithPayments(3);
    const history = new PaymentHistory(
      (query) => api.listPayments(query),
      app.controller.cache,
      {},
      2,
    );
    await history.refresh();

    const release = env.server.holdNext('listPayments');
    const slow = history.loadMore(); // page 2, held on its way
    await history.refresh(); // the newer load answers first
    release();
    await slow; // page 2 arrives late and is dropped
    assert.deepEqual(
      [history.state().ids.length, history.state().hasMore, history.state().loading],
      [2, true, false],
    );
  });

  it('keeps what it has when a page fails, and reports the failure', async () => {
    const { env, app, api } = await payerWithPayments(3);
    const history = new PaymentHistory(
      (query) => api.listPayments(query),
      app.controller.cache,
      {},
      2,
    );
    await history.refresh();
    env.server.inject('listPayments', { type: 'lose_response', applied: false });
    await history.loadMore();
    assert.deepEqual(
      [history.state().ids.length, history.state().failure, history.state().hasMore],
      [2, 'offline', true],
    );
  });
});

describe('mergeHistory', () => {
  it('shows a lost payment once without an invented ID, and an identified one once', async () => {
    const { env, app, api } = await payerWithPayments(1);
    env.server.inject('createPayment', { type: 'lose_response', applied: true });
    await app.controller.payOrder(env.server.seedOrder(PASTA), 500); // response lost

    // The list was fetched before the newest payment existed: it shows one of two.
    const history = new PaymentHistory((query) => api.listPayments(query), app.controller.cache);
    env.server.inject('listPayments', { type: 'stale' });
    await history.refresh();
    const rows = mergeHistory(history.state().ids, app.controller.cache, app.controller.list());
    assert.deepEqual(
      rows.map((row) => row.kind),
      ['unresolved', 'payment'],
    );

    await history.refresh(); // now it lists both; the identified payment is still shown once
    const again = mergeHistory(history.state().ids, app.controller.cache, app.controller.list());
    const paymentIds = again.flatMap((row) => (row.kind === 'payment' ? [row.payment.id] : []));
    assert.equal(paymentIds.length, 2);
    assert.equal(new Set(paymentIds).size, 2);
    assert.equal(again.filter((row) => row.kind === 'unresolved').length, 1);
  });
});
