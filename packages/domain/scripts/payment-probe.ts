/**
 * `pnpm api:payment-probe`: ONE controlled live payment, to observe how a payment's status and
 * version change when it settles (the contract does not say; an order's expiry kept its version).
 *
 * The seeded cashier rings up an order and the seeded payer pays the amount the server shows for
 * them. Both writes go through IntentController with a file store (`.local/payment-probe-intents.json`,
 * git-ignored) that is saved before anything is sent. Rerunning resumes instead of starting over:
 * the saved order and payment are reused, and an unknown one is resent with its SAME key, only inside
 * the replay window. A new order after an expired one, or a new payment after a decline, needs the
 * explicit `--new-order` / `--new-payment` flag: a deliberate new action after a known final result.
 *
 * The status/version sequence is read with plain GETs (not through the cache, which would hide an
 * equal-version change) and appended to `.local/live-ledger.json`. No token, password or response
 * body is printed or stored.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createApiClient, createTransport, monotonicNow } from '@mensa/api';
import {
  createScopedApi,
  IntentController,
  isFinal,
  PaymentGate,
  realScheduler,
  ServerClock,
  SessionCoordinator,
  type CallResult,
  type IntentRecord,
  type ScopedApi,
} from '../src/index';
import { FileIntentStore } from './file-intent-store';

loadRootEnv();
const baseUrl = process.env.ZAHLN_API_BASE_URL ?? 'https://dev.zahln.de';
const candidateId = process.env.ZAHLN_CANDIDATE_ID ?? '';
const password = process.env.ZAHLN_SMOKE_PASSWORD ?? '';
const cashierName = process.env.ZAHLN_PROBE_CASHIER ?? 'cashier-campus-1';
const payerName = process.env.ZAHLN_PROBE_PAYER ?? 'student';
const newOrder = process.argv.includes('--new-order');
const newPayment = process.argv.includes('--new-payment');
if (!candidateId || !password) {
  console.error('Set ZAHLN_CANDIDATE_ID (root .env) and ZAHLN_SMOKE_PASSWORD (seeded password).');
  process.exit(2);
}

const local = (name: string) => new URL(`../../../.local/${name}`, import.meta.url).pathname;
const store = new FileIntentStore(local('payment-probe-intents.json'));
const clock = new ServerClock(monotonicNow);
const client = createApiClient(
  createTransport({
    baseUrl,
    candidateId,
    appVersion: '1.0.0',
    onServerDate: (sample) => clock.observe(sample),
  }),
);

const cashier = await signIn(cashierName);
const payer = await signIn(payerName);

// 1. The order, rung up by the cashier (or resumed).
const till = cashier.controller;
let order: IntentRecord | undefined = till.list().find((r) => r.kind === 'createOrder');
if (order && newOrder && isFinal(order)) {
  console.log('--new-order: a deliberate new order after the previous one ended.');
  order = expectIntent(
    await till.createOrder(await firstItem(cashier), { afterFinalKey: order.key }),
  );
} else if (!order) {
  order = expectIntent(await till.createOrder(await firstItem(cashier)));
} else if (order.state !== 'applied') {
  console.log(`Saved order intent is "${order.state}": resending it with the SAME key.`);
  await till.retry(order.key);
  order = till.get(order.key) ?? order;
}
if (order?.kind !== 'createOrder' || !order.resource) exitWith('No order is known yet.', 3);
const orderId = order.resource.orderId;
const cashierOrder = await read(cashier.api.getOrder(orderId));
console.log(`Order ${orderId}: ${cashierOrder.status} v${cashierOrder.version} (cashier view)`);

// 2. The payment, for the amount the server shows this payer (or resumed).
const pay = payer.controller;
let attempt: IntentRecord | undefined = pay.list().find((r) => r.kind === 'payOrder');
if (!attempt || (newPayment && isFinal(attempt))) {
  const payerOrder = await read(payer.api.getOrder(orderId));
  if (payerOrder.status !== 'open')
    exitWith(`The order is ${payerOrder.status}: nothing to pay.`, 1);
  const amount = payerOrder.amountCents ?? 0;
  console.log(`Payer view: ${payerOrder.priceGroup ?? '?'} price ${amount} cents. Paying.`);
  const options = attempt ? { afterFinalKey: attempt.key } : {};
  attempt = expectIntent(await pay.payOrder(orderId, amount, options));
} else if (attempt.state !== 'applied') {
  console.log(`Saved payment intent is "${attempt.state}": resending it with the SAME key.`);
  await pay.retry(attempt.key);
  attempt = pay.get(attempt.key) ?? attempt;
}
if (attempt?.kind !== 'payOrder' || !attempt.resource) {
  exitWith(`Payment intent is "${attempt?.state}" (${attempt?.refusal ?? 'no answer'}).`, 3);
}
const paymentId = attempt.resource.paymentId;
console.log(
  `Payment ${paymentId}: ${attempt.resource.status} v${attempt.resource.version} (write response)`,
);

// 3. Raw reads every second, up to 3 minutes, recording each distinct state.
const payments: string[] = [`${attempt.resource.status} v${attempt.resource.version} (response)`];
const orders: string[] = [`${cashierOrder.status} v${cashierOrder.version}`];
const started = Date.now();
while (Date.now() - started < 180_000) {
  const [p, o] = await Promise.all([
    payer.api.getPayment(paymentId),
    cashier.api.getOrder(orderId),
  ]);
  if (p.kind === 'success') note(payments, `${p.data.status} v${p.data.version}`);
  if (o.kind === 'success') note(orders, `${o.data.status} v${o.data.version}`);
  const settled = p.kind === 'success' && p.data.status !== 'pending';
  const orderSettled = o.kind === 'success' && o.data.status !== 'paying';
  if (settled && orderSettled) break;
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
console.log(`Payment sequence: ${payments.join(' → ')}`);
console.log(`Order sequence (cashier): ${orders.join(' → ')}`);
appendLedger({
  at: new Date(clock.now()?.earliest ?? Date.now()).toISOString(),
  kind: 'payment-probe',
  cashier: cashierName,
  payer: payerName,
  orderId,
  paymentId,
  payments,
  orders,
});
cashier.controller.dispose();
payer.controller.dispose();
process.exit(0);

// ---- helpers --------------------------------------------------------------------------------------

async function signIn(username: string) {
  const session = new SessionCoordinator((credentials) => client.createSession(credentials));
  const result = await session.signIn({ username, password });
  if (!result.ok) exitWith(`Sign-in as ${username} failed: ${result.reason}`, 1);
  const user = result.user;
  const api = createScopedApi(client, session, user.id);
  const controller = new IntentController({
    scope: { candidateId, userId: user.id },
    role: user.role,
    api,
    store,
    clock,
    scheduler: realScheduler,
    newKey: randomUUID,
    gate: new PaymentGate('1.0.0', () => client.getConfig()),
  });
  await controller.load();
  if (controller.unreadable > 0) exitWith(`${username}: unreadable saved records, stopping.`, 1);
  console.log(`Signed in as ${username} (${user.role}); token kept in memory only.`);
  return { user, api, controller };
}

async function firstItem(cashierSession: { api: ScopedApi; user: { mensaId?: string | null } }) {
  const mensas = await read(cashierSession.api.listMensas());
  const item = mensas.items.find((mensa) => mensa.id === cashierSession.user.mensaId)?.menu[0];
  if (!item) exitWith("No menu item for the cashier's mensa.", 1);
  return [{ itemId: item.id, quantity: 1 }];
}

async function read<T>(call: Promise<CallResult<T>>): Promise<T> {
  const result = await call;
  if (result.kind !== 'success') exitWith(`Read failed: ${result.kind}`, 1);
  return result.data;
}

function expectIntent(outcome: Awaited<ReturnType<IntentController['payOrder']>>): IntentRecord {
  if ('intent' in outcome) return outcome.intent;
  exitWith(`Not started: ${outcome.type}${'reason' in outcome ? ` (${outcome.reason})` : ''}`, 1);
}

function note(list: string[], entry: string): void {
  if (list.at(-1) !== entry) list.push(entry);
}

function appendLedger(entry: Record<string, unknown>): void {
  const file = local('live-ledger.json');
  mkdirSync(new URL('../../../.local/', import.meta.url).pathname, { recursive: true });
  let ledger: unknown[] = [];
  try {
    ledger = JSON.parse(readFileSync(file, 'utf8')) as unknown[];
  } catch {
    // first entry
  }
  writeFileSync(file, JSON.stringify([...ledger, entry], null, 2));
}

function exitWith(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

function loadRootEnv(): void {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    // No root .env: variables come from the shell.
  }
}
