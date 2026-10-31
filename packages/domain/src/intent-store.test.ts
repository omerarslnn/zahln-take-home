import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { newIntent } from './intent';
import { IntentStorageError, scopeStorageId, serializeIntent } from './intent-store';
import { PASSWORD } from './testing/fake-server';
import { TestEnvironment } from './testing/harness';
import { MemoryIntentStore } from './testing/memory-intent-store';

const scope = { candidateId: 'c_test', userId: 'usr_student' };

describe('intent storage', () => {
  it('refuses a record larger than a SecureStore value, so the write is never sent', async () => {
    const tooBig = newIntent(
      {
        kind: 'createOrder',
        payload: {
          items: Array.from({ length: 20 }, (_, i) => ({
            itemId: `itm_${'x'.repeat(100)}_${i}`,
            quantity: 1,
          })),
        },
      },
      'k',
      scope,
    );
    assert.throws(() => serializeIntent(tooBig), IntentStorageError);

    const env = new TestEnvironment();
    const till = await env.startApp('cashier');
    const lines = Array.from({ length: 20 }, (_, i) => ({
      itemId: `itm_${'x'.repeat(100)}_${i}`,
      quantity: 1,
    }));
    assert.deepEqual(await till.controller.createOrder(lines), { type: 'storage_failed' });
    assert.equal(env.server.postedWrites('createOrder').length, 0);
  });

  it('keeps users apart, reports corrupt entries, and stores no credentials or names', async () => {
    const env = new TestEnvironment();
    const student = await env.startApp('student');
    const staff = await env.startApp('staff');
    await student.controller.payOrder(
      env.server.seedOrder([{ itemId: 'itm_pasta', quantity: 1 }]),
      500,
    );

    assert.equal((await env.store.load(staff.scope)).records.length, 0);
    const [raw] = env.store.rawEntries(student.scope);
    assert.ok(
      raw && !raw.includes('tok_') && !raw.includes(PASSWORD) && !raw.includes('displayName'),
    );

    env.store.corrupt(student.scope, 'broken', '{not json');
    const loaded = await env.store.load(student.scope);
    assert.deepEqual([loaded.records.length, loaded.unreadable], [1, 1]);
  });

  it('fails closed: with an unreadable saved record, no new action is started', async () => {
    const env = new TestEnvironment();
    const first = await env.startApp('student');
    env.store.corrupt(first.scope, 'broken', '{not json');

    const restarted = await env.startApp('student');
    const outcome = await restarted.controller.payOrder(
      env.server.seedOrder([{ itemId: 'itm_pasta', quantity: 1 }]),
      500,
    );
    assert.deepEqual(outcome, { type: 'not_allowed', reason: 'unreadable_records' });
    assert.equal(env.server.postedWrites('createPayment').length, 0);
  });

  it('maps scopes to storage names that use only SecureStore-safe characters and never collide', () => {
    const a = scopeStorageId({ candidateId: 'c_1', userId: 'a.b' });
    const b = scopeStorageId({ candidateId: 'c_1.a', userId: 'b' });
    assert.match(a, /^[A-Za-z0-9._-]+$/);
    assert.notEqual(a, b);
  });

  it('does not treat the in-memory store as durable: a new instance starts empty', async () => {
    const store = new MemoryIntentStore();
    await store.save(
      newIntent({ kind: 'payOrder', payload: { orderId: 'o', amountCents: 1 } }, 'k', scope),
    );
    assert.equal((await new MemoryIntentStore().load(scope)).records.length, 0);
  });
});
