import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { User } from '@mensa/api';
import { PaymentGate } from './payment-gate';
import { acceptsRoles, CASHIER_ROLES, checkCredentials, PAYER_ROLES, SignInFlow } from './sign-in';
import { PASSWORD } from './testing/fake-server';
import { TestEnvironment } from './testing/harness';

const PASTA = [{ itemId: 'itm_pasta', quantity: 1 }];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** One app process: its client, its one session coordinator (with the app's role policy), a flow. */
function startApp(
  env: TestEnvironment,
  roles = PAYER_ROLES,
  demoPassword: string | null = PASSWORD,
) {
  const { client, clock } = env.createClient();
  const session = env.createSession(client, { acceptsUser: acceptsRoles(roles) });
  const flow = new SignInFlow(session, demoPassword);
  /** Every user the session ever published to its listeners (what screens would have seen). */
  const published: (User | null)[] = [];
  session.subscribe(() => published.push(session.user()));
  const gate = new PaymentGate('1.0.0', () => client.getConfig());
  return { client, clock, session, flow, published, gate };
}

describe('checkCredentials', () => {
  it('requires both fields, trims the username and sends the password exactly as typed', () => {
    assert.deepEqual(checkCredentials('', ''), {
      ok: false,
      missing: { username: true, password: true },
    });
    assert.deepEqual(checkCredentials('   ', 'pw'), {
      ok: false,
      missing: { username: true, password: false },
    });
    assert.deepEqual(checkCredentials('student', ''), {
      ok: false,
      missing: { username: false, password: true },
    });
    assert.deepEqual(checkCredentials(' student ', ' pw '), {
      ok: true,
      credentials: { username: 'student', password: ' pw ' },
    });
  });
});

describe('SignInFlow', () => {
  it('signs in with a typed username and password and publishes the payer', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);

    const result = await app.flow.submit('student ', PASSWORD);

    assert.ok(result.ok);
    assert.equal(result.user.role, 'student');
    assert.equal(app.session.user()?.id, 'usr_student');
    assert.equal(app.session.holdsCredentials(), true); // for the 5-minute re-login only
    const [login] = env.server.postedWrites('createSession');
    assert.deepEqual(JSON.parse(login?.body ?? '{}'), { username: 'student', password: PASSWORD });
  });

  it('reports a wrong password or an unknown user as invalid credentials and keeps nothing', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);

    const wrongPassword = await app.flow.submit('student', 'not-the-password');
    const unknownUser = await app.flow.submit('nobody', PASSWORD);

    assert.deepEqual(wrongPassword, { ok: false, reason: 'invalid_credentials' });
    assert.deepEqual(unknownUser, { ok: false, reason: 'invalid_credentials' });
    assert.equal(app.session.user(), null);
    assert.equal(app.session.holdsCredentials(), false);
    assert.deepEqual(app.published.filter(Boolean), []);
  });

  it('sends nothing while a field is empty', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);

    const result = await app.flow.submit('  ', '');

    assert.deepEqual(result, {
      ok: false,
      reason: 'missing_input',
      missing: { username: true, password: true },
    });
    assert.equal(env.server.postedWrites('createSession').length, 0);
  });

  it('tells no connection apart from a server that answers without a session', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);

    env.server.inject('createSession', { type: 'lose_response', applied: false });
    const offline = await app.flow.submit('student', PASSWORD);
    env.server.inject('createSession', { type: 'problem', status: 503, code: 'unavailable' });
    const unavailable = await app.flow.submit('student', PASSWORD);
    env.server.inject('createSession', { type: 'gateway', code: 'timeout', applied: false });
    const timedOut = await app.flow.submit('student', PASSWORD);

    assert.deepEqual(offline, { ok: false, reason: 'no_connection' });
    assert.deepEqual(unavailable, { ok: false, reason: 'login_unavailable' });
    assert.deepEqual(timedOut, { ok: false, reason: 'login_unavailable' });
    assert.equal(app.session.user(), null);
    assert.equal(app.session.holdsCredentials(), false);
  });

  it('signs each payer demo account in with one tap, through the same session', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);

    for (const username of ['student', 'staff', 'guest']) {
      const result = await app.flow.signInDemo(username);
      assert.ok(result.ok, username);
      assert.equal(result.user.role, username);
      assert.equal(app.session.user()?.id, `usr_${username}`);
    }
    // One login per tap, each replacing the previous account.
    assert.equal(env.server.postedWrites('createSession').length, 3);
  });

  it('signs a cashier demo account in on the till', async () => {
    const env = new TestEnvironment();
    const till = startApp(env, CASHIER_ROLES);

    const result = await till.flow.signInDemo('cashier');

    assert.ok(result.ok);
    assert.equal(till.session.user()?.role, 'cashier');
  });

  it('offers no demo sign-in when the build has no published demo password', async () => {
    const env = new TestEnvironment();
    const app = startApp(env, PAYER_ROLES, null);

    assert.deepEqual(await app.flow.signInDemo('student'), {
      ok: false,
      reason: 'demo_unavailable',
    });
    assert.equal(env.server.postedWrites('createSession').length, 0);
    // Typed credentials still work.
    assert.ok((await app.flow.submit('student', PASSWORD)).ok);
  });

  it('runs one attempt at a time: a second submit or tap while one runs sends nothing', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);
    const release = env.server.hold('createSession');

    const first = app.flow.submit('student', PASSWORD);
    await flush();
    const later = [app.flow.submit('staff', PASSWORD), app.flow.signInDemo('guest')];
    await flush();
    release();
    const [second, tap] = await Promise.all(later);

    assert.deepEqual(
      [second, tap],
      [
        { ok: false, reason: 'in_progress' },
        { ok: false, reason: 'in_progress' },
      ],
    );
    assert.ok((await first).ok);
    assert.equal(env.server.postedWrites('createSession').length, 1);
    assert.equal(app.session.user()?.id, 'usr_student');
    // Once it has finished, the next attempt runs.
    assert.ok((await app.flow.signInDemo('staff')).ok);
  });
});

describe('role check before the session is published', () => {
  it('rejects a cashier in the student app without ever publishing them', async () => {
    const env = new TestEnvironment();
    const app = startApp(env, PAYER_ROLES);

    const result = await app.flow.submit('cashier', PASSWORD);

    assert.deepEqual(result, { ok: false, reason: 'wrong_role' });
    assert.equal(app.session.user(), null);
    // Listeners (the screens, and the provider that would build a payment controller) only ever
    // saw "nobody": the cashier never appeared, not even for one render.
    assert.deepEqual(app.published, [null]);
    assert.equal(app.session.holdsCredentials(), false);
    assert.deepEqual(
      await app.session.run('usr_cashier', (token) => app.client.listMensas(token)),
      { kind: 'no_session' },
    );
  });

  it('rejects a payer on the till', async () => {
    const env = new TestEnvironment();
    const till = startApp(env, CASHIER_ROLES);

    assert.deepEqual(await till.flow.signInDemo('student'), { ok: false, reason: 'wrong_role' });
    assert.deepEqual(till.published, [null]);
  });

  it('signs a payer out when a wrong-role sign-in replaces them', async () => {
    const env = new TestEnvironment();
    const app = startApp(env, PAYER_ROLES);
    assert.ok((await app.flow.submit('student', PASSWORD)).ok);

    assert.deepEqual(await app.flow.submit('cashier', PASSWORD), {
      ok: false,
      reason: 'wrong_role',
    });

    assert.equal(app.session.user(), null);
    assert.deepEqual(
      app.published.map((user) => user?.id ?? null),
      [null, 'usr_student', null],
    );
  });
});

describe('stale sign-in responses', () => {
  it('ignores a slow sign-in that a sign-out replaced', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);
    const release = env.server.hold('createSession');

    const slow = app.flow.submit('student', PASSWORD);
    await flush();
    app.session.signOut();
    release();

    assert.deepEqual(await slow, { ok: false, reason: 'superseded' });
    assert.equal(app.session.user(), null);
    assert.equal(app.session.holdsCredentials(), false);
  });

  it('never publishes an earlier account whose answer arrives after a newer sign-in', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);
    const releaseStudent = env.server.holdNext('createSession'); // only the student's login waits

    const student = app.session.signIn({ username: 'student', password: PASSWORD });
    await flush();
    assert.ok((await app.session.signIn({ username: 'staff', password: PASSWORD })).ok);
    releaseStudent();

    assert.deepEqual(await student, { ok: false, reason: 'superseded' });
    assert.equal(app.session.user()?.id, 'usr_staff');
    assert.ok(!app.published.some((user) => user?.id === 'usr_student'));
  });
});

describe('sign-out and account switching', () => {
  it('drops the session and the held credentials on sign-out', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);
    assert.ok((await app.flow.submit('student', PASSWORD)).ok);

    app.session.signOut();

    assert.equal(app.session.user(), null);
    assert.equal(app.session.holdsCredentials(), false);
    assert.deepEqual(
      await app.session.run('usr_student', (token) => app.client.listMensas(token)),
      { kind: 'no_session' },
    );
  });

  it('refuses calls for the previous account after switching', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);
    assert.ok((await app.flow.submit('student', PASSWORD)).ok);
    app.session.signOut();
    assert.ok((await app.flow.signInDemo('staff')).ok);

    assert.deepEqual(
      await app.session.run('usr_student', (token) => app.client.listMensas(token)),
      { kind: 'account_changed' },
    );
  });
});

describe('re-login with typed credentials', () => {
  it('renews an expired session with the same typed credentials and repeats the write', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);
    const signedIn = await app.flow.submit('student', PASSWORD);
    assert.ok(signedIn.ok);
    const controller = await env.startController(app, signedIn.user);
    const orderId = env.server.seedOrder(PASTA);
    env.server.expireSessions();

    const outcome = await controller.payOrder(orderId, 500);

    assert.equal(outcome.type, 'submitted');
    assert.equal(env.server.postedWrites('createSession').length, 2); // sign-in + one re-login
    const posts = env.server.postedWrites('createPayment');
    assert.equal(posts[1]?.idempotencyKey, posts[0]?.idempotencyKey);
    assert.equal(env.server.applied.createPayment, 1);
  });

  it('keeps the credentials when a re-login finds no connection, so a later call renews', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);
    assert.ok((await app.flow.submit('student', PASSWORD)).ok);
    env.server.expireSessions();
    env.server.inject('createSession', { type: 'lose_response', applied: false });

    const offline = await app.session.run('usr_student', (token) => app.client.listMensas(token));
    const later = await app.session.run('usr_student', (token) => app.client.listMensas(token));

    assert.deepEqual(offline, { kind: 'session_unavailable', reason: 'login_unavailable' });
    assert.equal(later.kind, 'success');
  });

  it('drops credentials the server refuses on re-login', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);
    assert.ok((await app.flow.submit('student', PASSWORD)).ok);
    env.server.expireSessions();
    env.server.inject('createSession', {
      type: 'problem',
      status: 401,
      code: 'invalid_credentials',
    });

    const refused = await app.session.run('usr_student', (token) => app.client.listMensas(token));

    assert.deepEqual(refused, { kind: 'session_unavailable', reason: 'invalid_credentials' });
    assert.equal(app.session.holdsCredentials(), false);
  });

  it('does not adopt a re-login whose account no longer has an accepted role', async () => {
    const env = new TestEnvironment();
    const app = startApp(env);
    assert.ok((await app.flow.submit('student', PASSWORD)).ok);
    env.server.expireSessions();
    const student = env.server.users.find((user) => user.username === 'student');
    if (student) student.role = 'cashier';

    const result = await app.session.run('usr_student', (token) => app.client.listMensas(token));

    assert.deepEqual(result, { kind: 'session_unavailable', reason: 'account_mismatch' });
    assert.equal(app.session.user()?.role, 'student'); // the accepted session was not replaced
    assert.equal(app.session.holdsCredentials(), false);
  });
});

describe('payment intents across sign-out and sign-in', () => {
  it("finds the student's unresolved payment after signing back in and resends it with its key", async () => {
    const env = new TestEnvironment();
    const app = startApp(env);
    const student = await app.flow.submit('student', PASSWORD);
    assert.ok(student.ok);
    const first = await env.startController(app, student.user);
    const orderId = env.server.seedOrder(PASTA);
    env.server.inject('createPayment', { type: 'lose_response', applied: true });
    const lost = await first.payOrder(orderId, 500);
    assert.ok(lost.type === 'submitted' && lost.intent.state === 'unknown');

    // Sign-out disposes the controller, as PaymentServices does; another account sees nothing.
    app.session.signOut();
    first.dispose();
    const staff = await app.flow.signInDemo('staff');
    assert.ok(staff.ok);
    const staffController = await env.startController(app, staff.user);
    assert.deepEqual(staffController.list(), []);
    app.session.signOut();
    staffController.dispose();

    // The student signs in again by typing; their saved intent is back, still unknown.
    const back = await app.flow.submit('student', PASSWORD);
    assert.ok(back.ok);
    const restored = await env.startController(app, back.user);
    assert.equal(restored.get(lost.intent.key)?.state, 'unknown');

    const retried = await restored.retry(lost.intent.key);
    assert.ok(retried.type === 'attempted' && retried.intent.state === 'applied');
    const posts = env.server.postedWrites('createPayment');
    assert.equal(posts.length, 2);
    assert.equal(posts[1]?.idempotencyKey, posts[0]?.idempotencyKey);
    assert.equal(env.server.applied.createPayment, 1); // paid once
  });
});
