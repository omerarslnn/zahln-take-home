import { parseHttpDate } from './http-date';
import { isProblem } from './problem';
import type { Problem } from './types';

export interface TransportConfig {
  /** API origin, e.g. https://dev.zahln.de. Public: it is embedded in every client build. */
  baseUrl: string;
  /** Data namespace sent as X-Candidate-Id on every request. Not a secret, not authentication. */
  candidateId: string;
  /** Native apps send their version so the server can refuse payments from outdated builds (426). */
  appVersion?: string | undefined;
  /** Upper bound for one attempt, including reading the body. */
  timeoutMs?: number;
  /** Injected in tests; defaults to the platform fetch (browser, React Native or Node). */
  fetchImpl?: typeof fetch;
  /** Clock for durations; injected in tests. */
  now?: () => number;
}

export interface RequestOptions {
  method: 'GET' | 'POST';
  /** Path below the API origin, starting with '/'. */
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Sent as JSON. */
  body?: unknown;
  /** Bearer token for authenticated endpoints. The caller keeps it in memory; it is never logged. */
  accessToken?: string;
  /** Required by POSTs that create orders, payments or refunds: one key per intent, reused on retry. */
  idempotencyKey?: string;
  timeoutMs?: number;
}

export interface ResponseMeta {
  status: number;
  durationMs: number;
  /** Server time from the Date header. Null if missing, unparsable or hidden from browser JS by CORS. */
  serverDate: Date | null;
  /** True when the server answered a repeated Idempotency-Key with the stored original result. */
  replayed: boolean;
}

/**
 * What one HTTP attempt produced. The transport reports only what happened on the wire and never
 * retries. Interpreting it is the caller's job: after a POST, `no_response` or a 502/504 problem means
 * the outcome is unknown (the server may have saved the change), not that the request failed.
 */
export type TransportResult<T> =
  | { kind: 'success'; data: T; meta: ResponseMeta }
  | { kind: 'problem'; problem: Problem; meta: ResponseMeta }
  | { kind: 'invalid_response'; meta: ResponseMeta }
  | { kind: 'no_response'; reason: 'timeout' | 'network'; durationMs: number };

export interface Transport {
  request<T>(options: RequestOptions): Promise<TransportResult<T>>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Creates the single HTTP entry point shared by the student app, the till, the dashboard and scripts. */
export function createTransport(config: TransportConfig): Transport {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const now = config.now ?? Date.now;
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  return {
    async request<T>(options: RequestOptions): Promise<TransportResult<T>> {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(
        () => {
          timedOut = true;
          controller.abort();
        },
        options.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      const startedAt = now();

      let received: { response: Response; text: string };
      try {
        const response = await fetchImpl(baseUrl + options.path + buildQuery(options.query), {
          method: options.method,
          headers: buildHeaders(config, options),
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });
        // The body is read inside the timeout too: a response can stall after its headers arrive.
        received = { response, text: await response.text() };
      } catch {
        return {
          kind: 'no_response',
          reason: timedOut ? 'timeout' : 'network',
          durationMs: now() - startedAt,
        };
      } finally {
        clearTimeout(timer);
      }

      return toResult<T>(received.response, received.text, now() - startedAt);
    },
  };
}

function buildHeaders(config: TransportConfig, options: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json, application/problem+json',
    'X-Candidate-Id': config.candidateId,
  };
  if (config.appVersion) headers['X-App-Version'] = config.appVersion;
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  return headers;
}

// Built by hand so the transport does not depend on URLSearchParams, whose React Native
// implementation has historically been incomplete.
function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const pairs = Object.entries(query).flatMap(([key, value]) =>
    value === undefined || value === null
      ? []
      : [`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`],
  );
  return pairs.length > 0 ? `?${pairs.join('&')}` : '';
}

function toResult<T>(response: Response, text: string, durationMs: number): TransportResult<T> {
  const meta: ResponseMeta = {
    status: response.status,
    durationMs,
    serverDate: parseHttpDate(response.headers.get('date')),
    replayed: response.headers.get('idempotent-replayed')?.toLowerCase() === 'true',
  };
  const body = parseJson(text);
  if (response.ok) {
    // Not validated at runtime yet: the shape is trusted from the contract types.
    return body.ok
      ? { kind: 'success', data: body.value as T, meta }
      : { kind: 'invalid_response', meta };
  }
  return body.ok && isProblem(body.value)
    ? { kind: 'problem', problem: body.value, meta }
    : { kind: 'invalid_response', meta };
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text === '') return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}
