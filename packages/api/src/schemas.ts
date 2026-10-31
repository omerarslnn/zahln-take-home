// Runtime validation for every response the app flows rely on. Each decoder is typed against the
// generated contract type, so the contract and the checks cannot drift apart silently. Role-specific
// fields (cashier view vs payer view) stay optional and nullable exactly as the contract defines them.
import * as d from './decode';
import type {
  AppConfig,
  DailyTotals,
  LocalizedText,
  Mensa,
  MensaList,
  MensaTotals,
  MenuItem,
  Order,
  OrderLine,
  Payer,
  Payment,
  PaymentDetail,
  PaymentEvent,
  PaymentItem,
  PaymentPage,
  Prices,
  Ref,
  Refund,
  Session,
  Till,
  TillTotals,
  User,
} from './types';

const id = d.nonEmptyString;
const eur = d.withDefault(d.literal('EUR'), 'EUR');
const priceGroup = d.oneOf(['student', 'staff', 'guest'] as const);

const ref = d.object<Ref>({ id, name: d.string });
const localizedText = d.object<LocalizedText>({ de: d.string, en: d.string });
const prices = d.object<Prices>({ student: d.cents, staff: d.cents, guest: d.cents });

/** The minimum version is kept as text here; the version policy decides what an invalid one means. */
export const appConfig = d.object<AppConfig>({
  minAppVersion: d.string,
  paymentsEnabled: d.boolean,
});

const user = d.object<User>({
  id,
  displayName: d.string,
  role: d.oneOf(['student', 'staff', 'guest', 'cashier', 'finance'] as const),
  priceGroup: d.optional(d.nullable(priceGroup)),
  tillId: d.optional(d.nullable(id)),
  mensaId: d.optional(d.nullable(id)),
});

/** The access token is an opaque credential: checked to be present, never parsed or decoded. */
export const session = d.object<Session>({
  accessToken: d.nonEmptyString,
  tokenType: d.withDefault(d.literal('Bearer'), 'Bearer'),
  expiresAt: d.timestamp,
  user,
});

const till = d.object<Till>({ id, name: d.string });
const menuItem = d.object<MenuItem>({ id, name: localizedText, prices });
const mensa = d.object<Mensa>({
  id,
  name: d.string,
  city: d.string,
  tills: d.array(till),
  menu: d.array(menuItem),
});
export const mensaList = d.object<MensaList>({ items: d.array(mensa) });

const orderLine = d.object<OrderLine>({
  itemId: id,
  name: localizedText,
  quantity: d.positiveInteger,
  unitPrices: d.optional(d.nullable(prices)), // cashier view only
  unitPriceCents: d.optional(d.nullable(d.cents)), // payer view only
});

export const order = d.object<Order>({
  id,
  status: d.oneOf(['open', 'paying', 'paid', 'expired'] as const),
  mensa: ref,
  till: ref,
  items: d.array(orderLine),
  qrPayload: d.nonEmptyString,
  currency: eur,
  amounts: d.optional(d.nullable(prices)), // cashier view only
  priceGroup: d.optional(d.nullable(priceGroup)), // payer view only
  amountCents: d.optional(d.nullable(d.cents)), // payer view only
  paymentId: d.optional(d.nullable(id)), // for a payer: only their own payment
  createdAt: d.timestamp,
  expiresAt: d.timestamp,
  version: d.nonNegativeInteger,
});

const payer = d.object<Payer>({ id, displayName: d.string });
const paymentItem = d.object<PaymentItem>({
  itemId: id,
  name: localizedText,
  quantity: d.positiveInteger,
  unitPriceCents: d.cents,
});

const paymentFields: d.Fields<Payment> = {
  id,
  orderId: id,
  status: d.oneOf(['pending', 'confirmed', 'declined'] as const),
  amountCents: d.cents,
  currency: eur,
  priceGroup,
  mensa: ref,
  till: ref,
  payer,
  items: d.array(paymentItem),
  refundedAmountCents: d.cents,
  pendingRefundAmountCents: d.cents,
  // Zero is a legitimate value: nothing left to refund.
  refundableAmountCents: d.cents,
  needsAttention: d.boolean,
  attentionReasons: d.array(
    d.oneOf(['pending_too_long', 'refund_pending_too_long', 'refund_failed'] as const),
  ),
  createdAt: d.timestamp,
  updatedAt: d.timestamp,
  version: d.nonNegativeInteger,
};

export const payment = d.object<Payment>(paymentFields);

export const refund = d.object<Refund>({
  id,
  paymentId: id,
  amountCents: d.cents,
  currency: eur,
  status: d.oneOf(['pending', 'completed', 'failed'] as const),
  reason: d.nullable(d.string),
  createdAt: d.timestamp,
  updatedAt: d.timestamp,
});

const paymentEvent = d.object<PaymentEvent>({
  at: d.timestamp,
  type: d.oneOf([
    'payment_created',
    'payment_confirmed',
    'payment_declined',
    'refund_requested',
    'refund_completed',
    'refund_failed',
  ] as const),
  amountCents: d.nullable(d.cents),
  refundId: d.nullable(id),
});

export const paymentDetail = d.object<PaymentDetail>({
  ...paymentFields,
  refunds: d.array(refund),
  history: d.array(paymentEvent),
});

export const paymentPage = d.object<PaymentPage>({
  items: d.array(payment),
  nextCursor: d.nullable(d.nonEmptyString),
});

const calendarDay: d.Decoder<string> = (input, path) => {
  const value = d.string(input, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const [year, month, day] = match ? match.slice(1).map(Number) : [];
  const valid =
    year !== undefined &&
    month !== undefined &&
    day !== undefined &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!valid) throw new d.DecodeError(path, 'YYYY-MM-DD');
  return value;
};

// Report totals: counts and gross amounts are never negative, but net = gross − refunds can be.
const totals = {
  paymentCount: d.nonNegativeInteger,
  grossCents: d.cents,
  refundedCents: d.cents,
  netCents: d.signedCents,
  pendingCount: d.nonNegativeInteger,
  pendingCents: d.cents,
};
const tillTotals = d.object<TillTotals>({ ...totals, till: ref });
const mensaTotals = d.object<MensaTotals>({ ...totals, mensa: ref, tills: d.array(tillTotals) });

export const dailyTotals = d.object<DailyTotals>({
  ...totals,
  date: calendarDay,
  currency: eur,
  mensas: d.array(mensaTotals),
});
