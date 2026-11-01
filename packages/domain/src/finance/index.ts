// Read-only finance rules for the Studierendenwerk dashboard. A separate entry point
// ('@mensa/domain/finance'): the native apps import '@mensa/domain' only, and Metro does not
// tree-shake, so dashboard code stays out of the phone and till bundles.
export { DailyReportStore, type DailyReportState, type FetchedReport } from './daily-report';
export {
  createFinanceApi,
  isRetryableRead,
  type FinanceApi,
  type ReadRetryOptions,
} from './finance-api';
export { csvInteger, csvText, PAYMENT_CSV_COLUMNS, paymentsToCsv } from './payment-csv';
export {
  collectPayments,
  EXPORT_PAGE_SIZE,
  type ExportFailure,
  type ExportFilter,
  type ExportOutcome,
  type ExportProgress,
} from './payment-export';
export { readFailureOf, type ReadFailure } from './read-failure';
