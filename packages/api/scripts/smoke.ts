/**
 * Opt-in live check against the supplied mock API: `pnpm api:smoke`.
 *
 * Sends only: GET /config, POST /sessions (one seeded account), GET /mensas, GET /mensas without a
 * token (to observe a structured Problem) and CORS preflights (OPTIONS, which never run a handler).
 * It never creates orders, payments or refunds. The token stays in memory and is never printed;
 * no user or transaction data is printed either.
 *
 * Configuration comes from the repository root .env (see .env.example) or the shell.
 */
import { request as httpsRequest } from 'node:https';
import { createApiClient, createTransport, type TransportResult } from '../src/index';

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;

loadRootEnv();
const baseUrl = process.env.ZAHLN_API_BASE_URL ?? 'https://dev.zahln.de';
const candidateId = process.env.ZAHLN_CANDIDATE_ID ?? '';
const username = process.env.ZAHLN_SMOKE_USERNAME ?? 'student';
const password = process.env.ZAHLN_SMOKE_PASSWORD ?? '';
const origins = (process.env.ZAHLN_SMOKE_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!candidateId) {
  console.error('ZAHLN_CANDIDATE_ID is missing. Run `pnpm env:init` and check the root .env.');
  process.exit(2);
}

const client = createApiClient(createTransport({ baseUrl, candidateId, timeoutMs: TIMEOUT_MS }));
const skews: number[] = [];
let failures = 0;

console.log(`API smoke check against ${baseUrl} (candidate ${mask(candidateId)})`);
console.log(
  `Bounded: ${MAX_ATTEMPTS} attempts per step, ${TIMEOUT_MS / 1000} s timeout per attempt.\n`,
);

const config = await step('GET /config', () => client.getConfig());
if (config.kind === 'success') {
  note(
    `paymentsEnabled=${config.data.paymentsEnabled}, minAppVersion=${config.data.minAppVersion}`,
  );
}

if (!password) {
  console.log('\nPOST /sessions and GET /mensas skipped: set ZAHLN_SMOKE_PASSWORD to the seeded');
  console.log('password from the "Seeded logins" table in the OpenAPI description.');
} else {
  // Retrying a login is safe: it moves no money and the endpoint takes no idempotency key.
  const session = await step(`POST /sessions (${username})`, () =>
    client.createSession({ username, password }),
  );
  if (session.kind === 'success') {
    const { user, expiresAt, accessToken } = session.data;
    const ttl = session.meta.serverDate
      ? Math.round((Date.parse(expiresAt) - session.meta.serverDate.getTime()) / 1000)
      : null;
    note(`role=${user.role}, priceGroup=${user.priceGroup ?? 'none'}, token=<redacted>`);
    note(
      `token lifetime by server clock: ${ttl === null ? 'unknown (no Date header)' : `${ttl} s`}`,
    );

    const mensas = await step('GET /mensas', () => client.listMensas(accessToken));
    if (mensas.kind === 'success') describeCatalogue(mensas.data.items);
  }
}

await observeProblemAndHeaders();
await checkCors();

if (skews.length > 0) {
  const average = skews.reduce((sum, skew) => sum + skew, 0) / skews.length;
  console.log(
    `\nServer clock minus local clock: ${(average / 1000).toFixed(1)} s ` +
      `(Date header has 1 s resolution).`,
  );
}
console.log(
  failures === 0 ? '\nResult: all required steps passed.' : `\nResult: ${failures} step(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);

// ---------------------------------------------------------------------------------------------

/** Runs one request with bounded attempts; retries only outcomes the server marks as retryable. */
async function step<T>(
  label: string,
  run: () => Promise<TransportResult<T>>,
): Promise<TransportResult<T>> {
  for (let attempt = 1; ; attempt += 1) {
    const startedAt = Date.now();
    const result = await run();
    if (result.kind !== 'no_response' && result.meta.serverDate) {
      const localMidpoint = startedAt + result.meta.durationMs / 2;
      skews.push(result.meta.serverDate.getTime() - localMidpoint);
    }
    console.log(`${label.padEnd(30)} attempt ${attempt}/${MAX_ATTEMPTS}  ${summarize(result)}`);
    const retryable =
      result.kind === 'no_response' ||
      (result.kind === 'problem' && result.problem.retryable) ||
      (result.kind === 'invalid_response' && result.meta.status >= 500);
    if (!retryable || attempt === MAX_ATTEMPTS) {
      if (result.kind !== 'success') failures += 1;
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
  }
}

function summarize(result: TransportResult<unknown>): string {
  switch (result.kind) {
    case 'success':
      return `HTTP ${result.meta.status}  ${result.meta.durationMs} ms  ok`;
    case 'problem':
      return `HTTP ${result.meta.status}  ${result.meta.durationMs} ms  problem code=${result.problem.code} retryable=${result.problem.retryable}`;
    case 'invalid_response':
      return `HTTP ${result.meta.status}  ${result.meta.durationMs} ms  body is neither JSON data nor a Problem`;
    case 'no_response':
      return `no response (${result.reason}) after ${result.durationMs} ms`;
  }
}

function describeCatalogue(
  mensas: { tills: unknown[]; menu: { prices: Record<string, number> }[] }[],
): void {
  const tills = mensas.reduce((sum, mensa) => sum + mensa.tills.length, 0);
  const items = mensas.flatMap((mensa) => mensa.menu);
  const integerPrices = items.every((item) =>
    ['student', 'staff', 'guest'].every((group) => Number.isInteger(item.prices[group])),
  );
  note(`${mensas.length} mensas, ${tills} tills, ${items.length} menu items`);
  note(`all prices integer cents for student/staff/guest: ${integerPrices ? 'yes' : 'NO'}`);
}

/** Observes a structured error and the response header names without sending any write. */
async function observeProblemAndHeaders(): Promise<void> {
  console.log('\nGET /mensas without a token (expect a 401 Problem):');
  const response = await raw('GET', '/mensas', { 'X-Candidate-Id': candidateId });
  if (!response) return;
  note(`HTTP ${response.status}, content-type=${response.headers['content-type'] ?? 'none'}`);
  try {
    const body = JSON.parse(response.body) as Record<string, unknown>;
    note(`problem fields: ${Object.keys(body).sort().join(', ')}; code=${String(body.code)}`);
  } catch {
    note('body is not JSON');
  }
  note(`response header names: ${Object.keys(response.headers).sort().join(', ')}`);
}

/**
 * Simulates the browser's CORS preflight from the dashboard origins. This only shows what the server
 * answers; it cannot prove that a browser accepts it. The dashboard's in-browser connection check does.
 * Like a real browser preflight, these OPTIONS requests carry no custom headers (so no X-Candidate-Id).
 */
async function checkCors(): Promise<void> {
  const preflights: { path: string; method: string; headers: string }[] = [
    { path: '/config', method: 'GET', headers: 'x-candidate-id' },
    { path: '/sessions', method: 'POST', headers: 'content-type,x-candidate-id' },
    { path: '/mensas', method: 'GET', headers: 'authorization,x-candidate-id' },
    {
      path: '/orders/ord_preflight_only/payments',
      method: 'POST',
      headers: 'authorization,content-type,idempotency-key,x-app-version,x-candidate-id',
    },
  ];
  for (const origin of origins) {
    console.log(`\nCORS as seen from ${origin} (simulated by Node, not a browser):`);
    for (const preflight of preflights) {
      const response = await raw('OPTIONS', preflight.path, {
        Origin: origin,
        'Access-Control-Request-Method': preflight.method,
        'Access-Control-Request-Headers': preflight.headers,
      });
      if (!response) continue;
      const h = response.headers;
      note(
        `OPTIONS ${preflight.method} ${preflight.path}: HTTP ${response.status}, ` +
          `allow-origin=${h['access-control-allow-origin'] ?? 'none'}, ` +
          `allow-headers=${h['access-control-allow-headers'] ?? 'none'}, ` +
          `max-age=${h['access-control-max-age'] ?? 'none'}`,
      );
    }
    const get = await raw('GET', '/config', { Origin: origin, 'X-Candidate-Id': candidateId });
    if (get) {
      note(
        `GET /config: allow-origin=${get.headers['access-control-allow-origin'] ?? 'none'}, ` +
          `expose-headers=${get.headers['access-control-expose-headers'] ?? 'none'} ` +
          `(Date and Idempotent-Replayed are readable by browser JS only if exposed here)`,
      );
    }
  }
}

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Minimal node:https request so the Origin header is sent exactly as given. */
function raw(
  method: string,
  path: string,
  headers: Record<string, string>,
): Promise<RawResponse | null> {
  return new Promise((resolve) => {
    const req = httpsRequest(
      new URL(path, baseUrl),
      { method, headers, timeout: TIMEOUT_MS },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => {
          const flat = Object.fromEntries(
            Object.entries(res.headers).map(([key, value]) => [key, String(value)]),
          );
          resolve({ status: res.statusCode ?? 0, headers: flat, body });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error) => {
      note(`${method} ${path}: no response (${error.message})`);
      resolve(null);
    });
    req.end();
  });
}

function note(message: string): void {
  console.log(`    ${message}`);
}

function mask(value: string): string {
  return value.length <= 6 ? '***' : `${value.slice(0, 4)}…${value.slice(-2)}`;
}

function loadRootEnv(): void {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    // No root .env: fall back to variables from the shell.
  }
}
