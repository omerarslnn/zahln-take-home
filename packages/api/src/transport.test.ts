import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTransport, type TransportConfig } from './transport';

const baseConfig: TransportConfig = { baseUrl: 'https://api.test/', candidateId: 'c_test' };

function respondWith(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): { fetchImpl: typeof fetch; calls: { url: string; init: RequestInit | undefined }[] } {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return Promise.resolve(new Response(body, { status, headers }));
  };
  return { fetchImpl, calls };
}

describe('createTransport', () => {
  it('sends X-Candidate-Id on every request and the bearer token only when given', async () => {
    const { fetchImpl, calls } = respondWith(200, '{}');
    const transport = createTransport({ ...baseConfig, fetchImpl });

    await transport.request({ method: 'GET', path: '/config' });
    await transport.request({ method: 'GET', path: '/mensas', accessToken: 'secret-token' });

    const [publicCall, authedCall] = calls.map((call) => new Headers(call.init?.headers));
    assert.equal(publicCall?.get('x-candidate-id'), 'c_test');
    assert.equal(publicCall?.get('authorization'), null);
    assert.equal(authedCall?.get('x-candidate-id'), 'c_test');
    assert.equal(authedCall?.get('authorization'), 'Bearer secret-token');
    assert.equal(calls[1]?.url, 'https://api.test/mensas');
  });

  it('adds the idempotency key, app version and JSON content type when relevant', async () => {
    const { fetchImpl, calls } = respondWith(201, '{}');
    const transport = createTransport({ ...baseConfig, appVersion: '0.1.0', fetchImpl });

    await transport.request({
      method: 'POST',
      path: '/orders',
      body: { items: [] },
      idempotencyKey: 'key-1',
    });

    const headers = new Headers(calls[0]?.init?.headers);
    assert.equal(headers.get('idempotency-key'), 'key-1');
    assert.equal(headers.get('x-app-version'), '0.1.0');
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(calls[0]?.init?.body, '{"items":[]}');
  });

  it('builds the query string and skips empty values', async () => {
    const { fetchImpl, calls } = respondWith(200, '{}');
    const transport = createTransport({ ...baseConfig, fetchImpl });

    await transport.request({
      method: 'GET',
      path: '/payments',
      query: { q: 'pay 1', limit: 50, cursor: undefined, needsAttention: true },
    });

    assert.equal(calls[0]?.url, 'https://api.test/payments?q=pay%201&limit=50&needsAttention=true');
  });

  it('returns the parsed body with the server Date and replay flag', async () => {
    const { fetchImpl } = respondWith(201, '{"id":"ord_1"}', {
      date: 'Thu, 29 Oct 2026 10:34:12 GMT',
      'idempotent-replayed': 'true',
    });
    const result = await createTransport({ ...baseConfig, fetchImpl }).request({
      method: 'POST',
      path: '/orders',
    });

    assert.equal(result.kind, 'success');
    if (result.kind !== 'success') return;
    assert.deepEqual(result.data, { id: 'ord_1' });
    assert.equal(result.meta.serverDate?.toISOString(), '2026-10-29T10:34:12.000Z');
    assert.equal(result.meta.replayed, true);
  });

  it('returns a structured problem for application/problem+json errors', async () => {
    const problem = {
      code: 'session_expired',
      title: 'Session expired',
      status: 401,
      retryable: false,
    };
    const { fetchImpl } = respondWith(401, JSON.stringify(problem), {
      'content-type': 'application/problem+json',
    });
    const result = await createTransport({ ...baseConfig, fetchImpl }).request({
      method: 'GET',
      path: '/mensas',
    });

    assert.equal(result.kind, 'problem');
    if (result.kind !== 'problem') return;
    assert.equal(result.problem.code, 'session_expired');
    assert.equal(result.meta.status, 401);
  });

  it('reports a non-problem error body (e.g. a proxy HTML page) as invalid_response', async () => {
    const { fetchImpl } = respondWith(502, '<html>Bad gateway</html>');
    const result = await createTransport({ ...baseConfig, fetchImpl }).request({
      method: 'GET',
      path: '/config',
    });

    assert.equal(result.kind, 'invalid_response');
  });

  it('reports a timeout as no_response, never as a server answer', async () => {
    const hangingFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    const result = await createTransport({ ...baseConfig, fetchImpl: hangingFetch }).request({
      method: 'POST',
      path: '/orders/ord_1/payments',
      timeoutMs: 20,
    });

    assert.deepEqual(
      { kind: result.kind, reason: result.kind === 'no_response' ? result.reason : undefined },
      { kind: 'no_response', reason: 'timeout' },
    );
  });

  it('reports a dropped connection as a network no_response', async () => {
    const failingFetch: typeof fetch = () =>
      Promise.reject(new TypeError('Network request failed'));
    const result = await createTransport({ ...baseConfig, fetchImpl: failingFetch }).request({
      method: 'GET',
      path: '/config',
    });

    assert.equal(result.kind, 'no_response');
    assert.equal(result.kind === 'no_response' && result.reason, 'network');
  });
});
