// Platform-neutral payment domain: the rules and their orchestration. No UI, no platform APIs;
// storage, key generation and timers are injected by each app (or by tests).
export { compareAppVersions, parseAppVersion, type AppVersion } from './app-version';
export {
  isFinal,
  needsReads,
  newIntent,
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
export type { PollingOptions, PollState } from './poller';
export { parseOrderQr, type QrParseResult } from './qr';
export { ResourceCache } from './resource-cache';
export { realScheduler, type Scheduler } from './scheduler';
export { expiryState, ServerClock, type ExpiryState, type ServerTime } from './server-clock';
export {
  createScopedApi,
  SessionCoordinator,
  type CallResult,
  type ScopedApi,
  type SeededAccount,
  type SessionFailure,
  type SignInResult,
} from './session';
export { newerOf, type Versioned } from './versioning';
export { classifyWrite, type AttemptOutcome, type WriteOperation } from './write-outcome';
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
