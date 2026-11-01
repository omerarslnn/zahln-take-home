import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PASSWORD } from './testing/fake-server';
import { TestEnvironment } from './testing/harness';

const PASTA = [{ itemId: 'itm_pasta', quantity: 1 }];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('SessionCoordinator', () => {
  it('shares one re-login between concurrent expired sessions and repeats each write with its own key', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const [orderA, orderB] = [env.server.seedOrder(PASTA), env.server.seedOrder(PASTA)];
    env.server.expireSessions();

    const [a, b] = await Promise.all([
      app.controller.payOrder(orderA, 500),
      app.controller.payOrder(orderB, 500),
    ]);

    assert.deepEqual([a.type, b.type], ['submitted', 'submitted']);
    assert.equal(env.server.postedWrites('createSession').length, 2); // sign-in + ONE re-login
    const posts = env.server.postedWrites('createPayment');
    assert.equal(posts.length, 4); // each payment: refused with 401, then repeated once
    const keys = posts.map((post) => post.idempotencyKey);
    assert.equal(new Set(keys).size, 2);
    assert.equal(env.server.applied.createPayment, 2);
  });

  it('never lets a changed account inherit the retry or the late result', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    env.server.expireSessions();
    const release = env.server.hold('createSession'); // the re-login stalls

    const paying = app.controller.payOrder(orderId, 500);
    await flush();
    const switching = app.session.signIn({ username: 'staff', password: PASSWORD });
    await flush();
    release();
    const [outcome, switched] = await Promise.all([paying, switching]);

    assert.equal(switched.ok && switched.user.id, 'usr_staff');
    assert.ok(outcome.type === 'submitted');
    // The student's attempt was refused (401) and NOT repeated with the staff session.
    assert.equal(env.server.postedWrites('createPayment').length, 1);
    assert.equal(env.server.applied.createPayment, 0);
    // Its outcome stays "maybe sent" for the student's scope; nothing is reported as a result.
    assert.equal(outcome.intent.state, 'unknown');
    assert.equal(app.session.user()?.id, 'usr_staff');
  });

  it('discards a repeated write whose response arrives after an account switch', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    env.server.expireSessions();
    let release: () => void = () => undefined;
    let writes = 0;
    env.server.onRequest = (route) => {
      // Hold the repeated payment (the second request) in flight.
      if (route === 'createPayment' && (writes += 1) === 2)
        release = env.server.hold('createPayment');
    };

    const paying = app.controller.payOrder(orderId, 500);
    while (writes < 2) await flush();
    await app.session.signIn({ username: 'staff', password: PASSWORD });
    release();
    const outcome = await paying;

    // The server applied the student's repeated write, but the late response is not used: the
    // student's intent stays "maybe applied" for the student's own scope, and staff sees nothing.
    assert.equal(env.server.applied.createPayment, 1);
    assert.ok(outcome.type === 'submitted');
    assert.equal(outcome.intent.state, 'unknown');
    assert.equal(app.session.user()?.id, 'usr_staff');
  });

  it('discards a first response that arrives after an account switch', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    let release: () => void = () => undefined;
    let writes = 0;
    env.server.onRequest = (route) => {
      if (route === 'createPayment' && (writes += 1) === 1)
        release = env.server.hold('createPayment');
    };

    const paying = app.controller.payOrder(orderId, 500);
    while (writes < 1) await flush();
    await app.session.signIn({ username: 'staff', password: PASSWORD });
    release();
    const outcome = await paying;

    // Applied for the student, but answered after the switch: kept as "maybe applied" in the
    // student's scope, to be read when the student returns; never reported as a result.
    assert.equal(env.server.applied.createPayment, 1);
    assert.ok(outcome.type === 'submitted');
    assert.equal(outcome.intent.state, 'unknown');
    assert.equal(app.session.user()?.id, 'usr_staff');
  });

  it('logs in again when the server has forgotten an expired token (401 unauthorized)', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    env.server.expireSessions('unauthorized'); // what the live API says a minute after expiry

    const outcome = await app.controller.payOrder(orderId, 500);
    assert.equal(outcome.type, 'submitted');
    assert.equal(env.server.postedWrites('createSession').length, 2); // sign-in + one re-login
    const posts = env.server.postedWrites('createPayment');
    assert.deepEqual(
      [posts.length, posts[1]?.idempotencyKey === posts[0]?.idempotencyKey],
      [2, true],
    );
    assert.equal(env.server.applied.createPayment, 1);
  });

  it('stops when the re-login answers with a different user', async () => {
    const env = new TestEnvironment();
    const app = await env.startApp('student');
    const orderId = env.server.seedOrder(PASTA);
    env.server.expireSessions();
    const student = env.server.users.find((user) => user.username === 'student');
    if (student) student.id = 'usr_someone_else';

    const outcome = await app.controller.payOrder(orderId, 500);

    assert.ok(outcome.type === 'submitted');
    assert.deepEqual(
      [outcome.intent.state, outcome.intent.refusal],
      ['ready', 'session_unavailable'],
    );
    assert.equal(env.server.postedWrites('createPayment').length, 1);
  });
});
