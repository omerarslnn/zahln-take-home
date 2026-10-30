// Readable aliases for the generated contract types. Edit openapi/openapi.json and run
// `pnpm api:generate` instead of changing src/generated/ by hand.
import type { components } from './generated/openapi';

type Schemas = components['schemas'];

export type AppConfig = Schemas['AppConfig'];
export type LoginRequest = Schemas['LoginRequest'];
export type Session = Schemas['Session'];
export type User = Schemas['User'];
export type Role = User['role'];
export type PriceGroup = keyof Schemas['Prices'];

export type Mensa = Schemas['Mensa'];
export type MensaList = Schemas['MensaList'];
export type Till = Schemas['Till'];
export type MenuItem = Schemas['MenuItem'];
export type Prices = Schemas['Prices'];
export type LocalizedText = Schemas['LocalizedText'];
export type Ref = Schemas['Ref'];

export type Order = Schemas['Order'];
export type OrderStatus = Order['status'];
export type OrderLine = Schemas['OrderLine'];
export type CreateOrder = Schemas['CreateOrder'];

export type Payment = Schemas['Payment'];
export type PaymentStatus = Payment['status'];
export type PaymentDetail = Schemas['PaymentDetail'];
export type PaymentEvent = Schemas['PaymentEvent'];
export type PaymentPage = Schemas['PaymentPage'];
export type CreatePayment = Schemas['CreatePayment'];

export type Refund = Schemas['Refund'];
export type RefundStatus = Refund['status'];
export type CreateRefund = Schemas['CreateRefund'];

export type DailyTotals = Schemas['DailyTotals'];
export type Problem = Schemas['Problem'];
