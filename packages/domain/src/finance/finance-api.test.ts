import type { ApiClient, ApiResult, PaymentPage, User } from '@mensa/api';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SessionCoordinator } from '../session';
import { immediateScheduler, meta, noResponse, ok, problem } from '../testing/finance-fixtures';
import { createFinanceApi } from './finance-api';

const FINANCE: User = { id: 'usr_finance', displayName: 'Finance', role: 'finance' };
const emptyPage = ok<PaymentPage>({ items: [], nextCursor: null });

/** A finance API whose GET /payments answers from `answers`, recording the token of each call. */
async function financeWith(answers: unknown[], hold?: Promise<void>) {
  let logins = 0;
  const tokens: string[] = [];
  const session = new SessionCoordinator(
    () => {
      logins += 1;
      const data = {
        accessToken: `token-${logins}`,
        tokenType: 'Bearer' as const,
        expiresAt: '2026-11-01T12:05:00Z',
        user: FINANCE,
      };
      return Promise.resolve({ kind: 'success' as const, data, meta: meta() });
    },
    { maxLoginAttempts: 1, scheduler: immediateScheduler },
  );
  const client = {
    async listPayments(token: string) {
      tokens.push(token);
      if (hold) await hold;
      return (answers.shift() ?? emptyPage) as ApiResult<PaymentPage>;
    },
  } as unknown as ApiClient;
  await session.signIn({ username: 'finance', password: 'test-password' });
  const api = createFinanceApi(client, session, FINANCE.id, { scheduler: immediateScheduler });
  return { api, session, tokens, logins: () => logins };
}

describe('createFinanceApi', () => {
  it('repeats a transient failure a bounded number of times and returns the first success', async () => {
    const { api, tokens } = await financeWith([
      problem('unavailable', 503, true),
      noResponse,
      emptyPage,
    ]);
    const result = await api.listPayments({});
    assert.equal(result.kind, 'success');
    assert.equal(tokens.length, 3);
  });

  it('stops after three attempts and reports the last failure', async () => {
    const unavailable = () => problem('unavailable', 503, true);
    const { api, tokens } = await financeWith([
      unavailable(),
      unavailable(),
      unavailable(),
      emptyPage,
    ]);
    const result = await api.listPayments({});
    assert.equal(result.kind === 'problem' && result.problem.code, 'unavailable');
    assert.equal(tokens.length, 3);
  });

  it('does not repeat a final refusal', async () => {
    const { api, tokens } = await financeWith([problem('forbidden', 403, false), emptyPage]);
    const result = await api.listPayments({});
    assert.equal(result.kind === 'problem' && result.problem.code, 'forbidden');
    assert.equal(tokens.length, 1);
  });

  it('logs the same account in again on an expired token and repeats the read once', async () => {
    const { api, tokens, logins } = await financeWith([
      problem('unauthorized', 401, false),
      emptyPage,
    ]);
    const result = await api.listPayments({});
    assert.equal(result.kind, 'success');
    assert.deepEqual(tokens, ['token-1', 'token-2']);
    assert.equal(logins(), 2);
  });

  it('gives no result for a read that a sign-out overtook, and does not repeat it', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const { api, session, tokens } = await financeWith([emptyPage], held);
    const reading = api.listPayments({});
    session.signOut();
    release();
    assert.equal((await reading).kind, 'account_changed');
    assert.equal(tokens.length, 1);
  });
});
