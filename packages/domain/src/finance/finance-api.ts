import type {
  ApiClient,
  ApiResult,
  DailyTotals,
  MensaList,
  PaymentDetail,
  PaymentPage,
  PaymentQuery,
} from '@mensa/api';
import { realScheduler, type Scheduler } from '../scheduler';
import type { CallResult, SessionCoordinator } from '../session';

/**
 * What the finance dashboard may call: reads only. There is no write method on this type, so the
 * dashboard cannot create orders, payments or refunds even by mistake. Every call runs through the
 * SessionCoordinator for one user (re-login on an expired token, and no result after a sign-out or
 * account switch), and is repeated a bounded number of times when the failure is transient.
 */
export interface FinanceApi {
  /** GET /reports/daily-totals for one Berlin calendar day (YYYY-MM-DD). */
  getDailyTotals(day: string): Promise<CallResult<DailyTotals>>;
  /** GET /payments: one page, newest first, filters combined with AND. */
  listPayments(query: PaymentQuery): Promise<CallResult<PaymentPage>>;
  /** GET /payments/{id}: one payment with its refunds and full history. */
  getPayment(paymentId: string): Promise<CallResult<PaymentDetail>>;
  /** GET /mensas: mensas and their tills, for the filters. */
  listMensas(): Promise<CallResult<MensaList>>;
}

export interface ReadRetryOptions {
  /** Attempts per read, including the first (default 3). */
  attempts?: number;
  /** Wait before the second attempt; it grows linearly after that (default 600 ms). */
  delayMs?: number;
  scheduler?: Scheduler;
}

/**
 * Whether a failed read may succeed when repeated. A GET changes nothing, so repeating it is always
 * safe; the question is only whether it can help. The server marks transient problems (503, 502,
 * 504) as retryable; no response and an unusable body (e.g. a proxy's error page) may be transient
 * too. Session failures, a changed account and refusals such as 400/403/404 are final.
 */
export function isRetryableRead(result: CallResult<unknown>): boolean {
  switch (result.kind) {
    case 'no_response':
    case 'invalid_response':
      return true;
    case 'problem':
      return result.problem.retryable;
    default:
      return false;
  }
}

export function createFinanceApi(
  client: ApiClient,
  session: SessionCoordinator,
  userId: string,
  options: ReadRetryOptions = {},
): FinanceApi {
  const attempts = Math.max(1, options.attempts ?? 3);
  const delayMs = options.delayMs ?? 600;
  const scheduler = options.scheduler ?? realScheduler;
  const wait = (ms: number) => new Promise<void>((resolve) => scheduler.setTimer(resolve, ms));

  async function read<T>(call: (token: string) => Promise<ApiResult<T>>): Promise<CallResult<T>> {
    let result = await session.run(userId, call);
    for (let attempt = 2; attempt <= attempts && isRetryableRead(result); attempt += 1) {
      await wait(delayMs * (attempt - 1));
      result = await session.run(userId, call);
    }
    return result;
  }

  return {
    getDailyTotals: (day) => read((token) => client.getDailyTotals(token, day)),
    listPayments: (query) => read((token) => client.listPayments(token, query)),
    getPayment: (paymentId) => read((token) => client.getPayment(token, paymentId)),
    listMensas: () => read((token) => client.listMensas(token)),
  };
}
