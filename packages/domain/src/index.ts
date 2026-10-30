// Platform-neutral payment domain. Stage 1 holds only the version rule; the payment and refund
// state machines, intent persistence and reconciliation are added in stage 2 (see CLAUDE.md).
export { newerOf, type Versioned } from './versioning';
export type {
  Order,
  OrderStatus,
  Payment,
  PaymentDetail,
  PaymentStatus,
  PriceGroup,
  Refund,
  RefundStatus,
  Role,
} from '@mensa/api';
