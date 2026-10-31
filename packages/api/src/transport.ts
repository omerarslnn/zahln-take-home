import { parseHttpDate } from './http-date';
import { toProblem } from './problem';
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
  /**
   * Monotonic clock in milliseconds for durations and server-time samples. Defaults to
   * `performance.now()`, which, unlike `Date.now()`, does not jump when the user changes the
   * device clock. Injected in tests.
   */
  now?: () => number;
  /** Receives every valid `Date` header with the local send/receive times (feeds the server clock). */
  onServerDate?: (sample: ServerDateSample) => void;
}

/** A server timestamp and the monotonic interval in which the server must have produced it. */
export interface ServerDateSample {
  serverDate: Date;
  sentAt: number;
  receivedAt: number;
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
 * Why a response could not be used: a 2xx body that is not JSON, an error body that is not a Problem
 * (e.g. a proxy's HTML page), or a 2xx resource that failed validation (set by the API client).
 */
export type InvalidResponseReason =
  'unparsable_body' | 'unexpected_error_body' | 'invalid_resource';

/**
 * What one HTTP attempt produced. The transport reports only what happened on the wire and never
 * retries. Interpreting it is the caller's job: after a POST, `no_response`, `invalid_response` or a
 * 502/504 problem means the outcome is unknown (the server may have saved the change), not a failure.
 */
export type TransportResult<T> =
  | { kind: 'success'; data: T; meta: ResponseMeta }
  | { kind: 'problem'; problem: Problem; meta: ResponseMeta }
  | {
      kind: 'invalid_response';
      reason: InvalidResponseReason;
      /** Field path that failed validation (never the value), for diagnostics. */
      detail?: string;
      meta: ResponseMeta;
    }
  | { kind: 'no_response'; reason: 'timeout' | 'network'; durationMs: number };

export interface Transport {
  request<T>(options: RequestOptions): Promise<TransportResult<T>>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

const performanceClock = (globalThis as { performance?: { now(): number } }).performance;
/** Milliseconds from a clock that never jumps with the device time; falls back to `Date.now`. */
export const monotonicNow: () => number = performanceClock
  ? () => performanceClock.now()
  : () => Date.now();

/** Creates the single HTTP entry point shared by the student app, the till, the dashboard and scripts. */
export function createTransport(config: TransportConfig): Transport {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const now = config.now ?? monotonicNow;
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
        reportServerDate(config, response, startedAt, now());
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

// The headers have arrived, so the server produced its Date somewhere between sending and now.
function reportServerDate(
  config: TransportConfig,
  response: Response,
  sentAt: number,
  receivedAt: number,
): void {
  const serverDate = parseHttpDate(response.headers.get('date'));
  if (serverDate && config.onServerDate) config.onServerDate({ serverDate, sentAt, receivedAt });
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
    // Only JSON-ness is checked here; the API client validates the resource itself.
    return body.ok
      ? { kind: 'success', data: body.value as T, meta }
      : { kind: 'invalid_response', reason: 'unparsable_body', meta };
  }
  const problem = body.ok ? toProblem(body.value) : null;
  return problem
    ? { kind: 'problem', problem, meta }
    : { kind: 'invalid_response', reason: 'unexpected_error_body', meta };
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text === '') return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}
