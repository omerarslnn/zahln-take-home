import type { Payment } from '@mensa/api';
import type { HistoryState } from '@mensa/domain';
import { useI18n } from '@mensa/shared/react';
import { formatAge } from '../finance/age';
import { paymentBadges, readFailureKey } from '../finance/text';
import { useServerNow } from '../finance/useServerNow';
import { routeHref } from '../routing';
import {
  BerlinTime,
  Button,
  linkClass,
  Money,
  Notice,
  StatusBadge,
  TableScroll,
  td,
  tdNumber,
  th,
  thNumber,
} from './ui';

/**
 * Payments as loaded so far (newest first, as the server sends them). Nothing is sorted or filtered
 * locally: what it shows is exactly the loaded part of the server's result. A table from 640 px
 * up; on a phone the same rows as compact cards, so amount and status need no sideways scrolling.
 */
export function PaymentTable({
  rows,
  caption,
  back,
  showAge = false,
}: {
  rows: readonly Payment[];
  caption: string;
  /** The route to return to from a payment's detail page. */
  back: string;
  showAge?: boolean;
}) {
  const { t, locale } = useI18n();
  const now = useServerNow();
  return (
    <>
      <ul aria-label={caption} className="space-y-2 sm:hidden">
        {rows.map((payment) => (
          <li key={payment.id} className="space-y-1 rounded-control border border-line/30 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <a
                href={routeHref({ page: 'payment', paymentId: payment.id, back })}
                className={linkClass}
              >
                <span className="sr-only">{t('finance.openPayment')} </span>
                <code>{payment.id}</code>
              </a>
              <Money cents={payment.amountCents} strong />
            </div>
            <div className="flex flex-wrap gap-1">
              {paymentBadges(payment).map((badge) => (
                <StatusBadge key={badge.key} badge={badge} />
              ))}
            </div>
            <p className="text-sm text-ink-muted">
              <BerlinTime value={payment.createdAt} />
              {showAge ? ` · ${formatAge(payment.createdAt, now, locale)}` : ''} ·{' '}
              {payment.mensa.name} · {payment.till.name}
            </p>
            {payment.refundedAmountCents > 0 || payment.pendingRefundAmountCents > 0 ? (
              <p className="text-sm">
                {t('finance.col.refunded')} <Money cents={payment.refundedAmountCents} />
                {payment.pendingRefundAmountCents > 0 ? (
                  <>
                    {' '}
                    ({t('finance.col.refundPending')}{' '}
                    <Money cents={payment.pendingRefundAmountCents} />)
                  </>
                ) : null}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <TableScroll label={caption}>
          <table className="w-full min-w-[60rem] border-collapse">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('finance.col.created')}
                </th>
                {showAge ? (
                  <th scope="col" className={th}>
                    {t('finance.col.age')}
                  </th>
                ) : null}
                <th scope="col" className={th}>
                  {t('finance.col.payment')}
                </th>
                <th scope="col" className={th}>
                  {t('finance.col.status')}
                </th>
                <th scope="col" className={thNumber}>
                  {t('finance.col.amount')}
                </th>
                <th scope="col" className={thNumber}>
                  {t('finance.col.refunded')}
                </th>
                <th scope="col" className={th}>
                  {t('finance.col.place')}
                </th>
                <th scope="col" className={th}>
                  {t('finance.col.payer')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => (
                <tr key={payment.id}>
                  <td className={td}>
                    <BerlinTime value={payment.createdAt} />
                  </td>
                  {showAge ? (
                    <td className={`${td} whitespace-nowrap`}>
                      {formatAge(payment.createdAt, now, locale)}
                    </td>
                  ) : null}
                  <th scope="row" className={`${td} text-left font-normal`}>
                    <a
                      href={routeHref({ page: 'payment', paymentId: payment.id, back })}
                      className={linkClass}
                    >
                      <span className="sr-only">{t('finance.openPayment')} </span>
                      <code>{payment.id}</code>
                    </a>
                  </th>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      {paymentBadges(payment).map((badge) => (
                        <StatusBadge key={badge.key} badge={badge} />
                      ))}
                    </div>
                  </td>
                  <td className={tdNumber}>
                    <Money cents={payment.amountCents} />
                  </td>
                  <td className={tdNumber}>
                    <Money cents={payment.refundedAmountCents} />
                    {payment.pendingRefundAmountCents > 0 ? (
                      <span className="block text-sm text-ink-muted">
                        {t('finance.col.refundPending')}{' '}
                        <Money cents={payment.pendingRefundAmountCents} />
                      </span>
                    ) : null}
                  </td>
                  <td className={td}>
                    {payment.mensa.name} · {payment.till.name}
                  </td>
                  <td className={td}>
                    <code>{payment.payer.id}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </div>
    </>
  );
}

/**
 * What the list knows about its own completeness. While more pages exist it says how many are
 * loaded so far, never that this is the number of matching payments.
 */
export function ListStatus({
  state,
  started,
  shown,
  emptyText,
  onMore,
  onRetry,
}: {
  state: HistoryState;
  /** False until the first request went out, so an empty list is never announced too early. */
  started: boolean;
  shown: number;
  emptyText: string;
  onMore: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (state.failure) {
    return (
      <Notice
        tone="error"
        role="alert"
        title={t(shown === 0 ? 'finance.list.failed' : 'finance.list.moreFailed')}
      >
        <p>{t(readFailureKey(state.failure))}</p>
        <Button onClick={onRetry}>{t('common.retry')}</Button>
      </Notice>
    );
  }
  const text =
    state.loading || !started
      ? t('finance.list.loading')
      : state.hasMore
        ? t('finance.list.more', { count: shown })
        : shown === 0
          ? emptyText
          : t('finance.list.end', { count: shown });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm text-ink-muted">
        {text}
      </p>
      {state.hasMore ? (
        <Button tone="secondary" busy={state.loading} onClick={onMore}>
          {t('finance.list.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
