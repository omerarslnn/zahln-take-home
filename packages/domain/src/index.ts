// Platform-neutral payment domain: the rules and their orchestration. No UI, no platform APIs;
// storage, key generation and timers are injected by each app (or by tests).
export { compareAppVersions, parseAppVersion, type AppVersion } from './app-version';
export {
  addItem,
  canAdd,
  MAX_BASKET_LINES,
  MAX_LINE_QUANTITY,
  quantityOf,
  removeItem,
  type Basket,
} from './basket';
export {
  CONNECTIVITY_SETTLE_MS,
  GATE_RETRY_DELAYS_MS,
  GateRecovery,
  type ConnectivitySource,
  type GateChecks,
} from './gate-recovery';
export {
  canCloseUnshownOrder,
  isFinal,
  needsReads,
  newIntent,
  ORDER_LIFETIME_MS,
  paymentDisplay,
  replayPermission,
  REPLAY_WINDOW_MS,
  type CreateOrderIntent,
  type IntentKind,
  type IntentRecord,
  type PaymentDisplay,
  type PayOrderIntent,
  type RefundIntent,
  type Scope,
  type WriteState,
} from './intent';
export {
  IntentController,
  type IntentControllerOptions,
  type NotAllowedReason,
  type RetryOutcome,
  type StartOutcome,
} from './intent-controller';
export {
  IntentStorageError,
  MAX_RECORD_BYTES,
  parseIntent,
  scopeStorageId,
  serializeIntent,
  type IntentStore,
  type StoredIntents,
} from './intent-store';
export {
  evaluatePaymentPolicy,
  PaymentGate,
  type BlockReason,
  type GateState,
} from './payment-gate';
export {
  PaymentAuthorizer,
  type AuthorizedOutcome,
  type LocalAuthResult,
  type PaymentBinding,
} from './payment-authorization';
export {
  mergeHistory,
  PaymentHistory,
  type HistoryEntry,
  type HistoryFailure,
  type HistoryState,
} from './payment-history';
export type { PollingOptions, PollState } from './poller';
export { parseOrderCode, parseOrderQr, type QrParseResult } from './qr';
export { ResourceCache } from './resource-cache';
export { ScanLock } from './scan-lock';
export { realScheduler, type Scheduler } from './scheduler';
export { expiryState, ServerClock, type ExpiryState, type ServerTime } from './server-clock';
export {
  createScopedApi,
  SessionCoordinator,
  type CallResult,
  type ScopedApi,
  type LoginFailure,
  type SeededAccount,
  type SessionFailure,
  type SignInResult,
} from './session';
export {
  acceptsRoles,
  CASHIER_ROLES,
  checkCredentials,
  PAYER_ROLES,
  SignInFlow,
  type MissingFields,
  type SignInAttempt,
} from './sign-in';
export { newerOf, type Versioned } from './versioning';
export { classifyWrite, type AttemptOutcome, type WriteOperation } from './write-outcome';
export type {
  Mensa,
  MenuItem,
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
