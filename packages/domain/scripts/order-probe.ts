/**
 * `pnpm api:order-probe`: creates ONE order as a seeded cashier to observe the `qrPayload` format.
 *
 * It goes through the real intent path: the intent is saved to `.local/order-probe-intents.json`
 * (git-ignored) before the request is sent, and running the script again reuses that intent and its
 * key: an unresolved one is retried with the same key, an applied one is only read. So repeated
 * runs never create a second order. It creates no payments or refunds and prints no token or
 * password; the payload is printed with the order ID replaced by <orderId>.
 */
import { randomUUID } from 'node:crypto';
import { createApiClient, createTransport, monotonicNow } from '@mensa/api';
import {
  createScopedApi,
  IntentController,
  PaymentGate,
  realScheduler,
  ServerClock,
  SessionCoordinator,
} from '../src/index';
import { FileIntentStore } from './file-intent-store';

loadRootEnv();
const baseUrl = process.env.ZAHLN_API_BASE_URL ?? 'https://dev.zahln.de';
const candidateId = process.env.ZAHLN_CANDIDATE_ID ?? '';
const username = process.env.ZAHLN_PROBE_CASHIER ?? 'cashier-campus-1';
const password = process.env.ZAHLN_SMOKE_PASSWORD ?? '';
if (!candidateId || !password) {
  console.error('Set ZAHLN_CANDIDATE_ID (root .env) and ZAHLN_SMOKE_PASSWORD (seeded password).');
  process.exit(2);
}

const clock = new ServerClock(monotonicNow);
const client = createApiClient(
  createTransport({ baseUrl, candidateId, onServerDate: (sample) => clock.observe(sample) }),
);
const session = new SessionCoordinator((credentials) => client.createSession(credentials));
const signedIn = await session.signIn({ username, password });
if (!signedIn.ok) {
  console.error(`Sign-in failed: ${signedIn.reason}`);
  process.exit(1);
}
const user = signedIn.user;
console.log(`Signed in as ${username} (role ${user.role}); token kept in memory only.`);

const controller = new IntentController({
  scope: { candidateId, userId: user.id },
  role: user.role,
  api: createScopedApi(client, session, user.id),
  store: new FileIntentStore(
    new URL('../../../.local/order-probe-intents.json', import.meta.url).pathname,
  ),
  clock,
  scheduler: realScheduler,
  newKey: randomUUID,
  gate: new PaymentGate(undefined, () => client.getConfig()),
});
await controller.load();
if (controller.unreadable > 0) {
  console.error(
    `${controller.unreadable} saved record(s) could not be read: no new order (fail-closed).`,
  );
  process.exit(1);
}

const existing = controller.list().find((record) => record.kind === 'createOrder');
let key: string;
if (!existing) {
  const itemId = await firstMenuItem();
  console.log(`No saved order intent: creating one order with 1 × ${itemId}.`);
  const started = await controller.createOrder([{ itemId, quantity: 1 }]);
  if (!('intent' in started)) {
    console.error(
      `Not started: ${started.type}${'reason' in started ? ` (${started.reason})` : ''}`,
    );
    process.exit(1);
  }
  key = started.intent.key;
} else if (existing.state === 'applied') {
  console.log('Saved order intent already applied: reading the order, no write.');
  key = existing.key;
  await controller.reconcile(key);
} else {
  console.log(`Saved order intent is "${existing.state}": retrying with the SAME key.`);
  key = existing.key;
  const retried = await controller.retry(key);
  console.log(`Retry: ${retried.type}`);
}

const record = controller.get(key);
controller.dispose();
console.log(
  `Intent: state=${record?.state}, attempts=${record?.attempts}, key=${key.slice(0, 8)}…`,
);
if (record?.kind !== 'createOrder' || !record.resource) {
  console.log('No order known yet; run again later (same key) or inspect the saved intent.');
  process.exit(record?.state === 'unknown' ? 3 : 1);
}

const order = controller.cache.order(record.resource.orderId);
if (!order) process.exit(1);
const now = clock.now();
console.log(`Order: status=${order.status}, version=${order.version}, items=${order.items.length}`);
console.log(
  `Expires in ≈${now ? Math.round((Date.parse(order.expiresAt) - now.earliest) / 1000) : '?'} s (server clock)`,
);
describeQr(order.qrPayload, order.id);
process.exit(0);

function describeQr(payload: string, orderId: string): void {
  const sanitized = payload.split(orderId).join('<orderId>');
  console.log('\nqrPayload, sanitized:', sanitized);
  console.log('  length:', payload.length, '| contains the order ID:', payload.includes(orderId));
  console.log('  occurrences of the order ID:', payload.split(orderId).length - 1);
  try {
    const url = new URL(payload);
    console.log(
      `  URL: scheme=${url.protocol} host=${url.host || '(none)'} path=${url.pathname.split(orderId).join('<orderId>')}`,
    );
    console.log(`  query keys: ${[...url.searchParams.keys()].join(', ') || '(none)'}`);
  } catch {
    console.log('  not an absolute URL');
  }
  console.log('  digits other than inside the order ID:', /\d/.test(sanitized));
}

async function firstMenuItem(): Promise<string> {
  const token = await session.run(user.id, (accessToken) => client.listMensas(accessToken));
  if (token.kind !== 'success') throw new Error(`GET /mensas failed: ${token.kind}`);
  const mensa = token.data.items.find((candidate) => candidate.id === user.mensaId);
  const item = mensa?.menu[0];
  if (!item) throw new Error("No menu item found for the cashier's mensa");
  return item.id;
}

function loadRootEnv(): void {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    // No root .env: variables come from the shell.
  }
}
