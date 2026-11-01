import type { Payment, PaymentDetail } from '@mensa/api';
import { formatBerlinTime } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import type { ReactNode } from 'react';
import {
  BerlinTime,
  Button,
  linkClass,
  Money,
  Notice,
  Section,
  StatusBadge,
  TableScroll,
  td,
  tdNumber,
  th,
  thNumber,
} from '../components/ui';
import { usePaymentDetail } from '../finance/hooks';
import { useFinance } from '../finance/session';
import { historyEventKey, paymentBadges, readFailureKey, refundStatusBadge } from '../finance/text';

/**
 * One payment with its refunds and full server history. It stays readable while a newer copy
 * loads. If the cache knows a NEWER version than the last detail (e.g. from a list), the old
 * refunds and history are withheld rather than shown as current, until the detail is read again.
 */
export function PaymentPage({ paymentId, back }: { paymentId: string; back: string | null }) {
  const services = useFinance();
  const { t, locale } = useI18n();
  const { view, request, reload } = usePaymentDetail(services, paymentId);
  const fetched = request.fetchedAt ? formatBerlinTime(request.fetchedAt, locale) : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a href={back ?? '#/transactions'} className={linkClass}>
          {t(
            back?.startsWith('#/attention')
              ? 'finance.payment.backAttention'
              : 'finance.payment.backList',
          )}
        </a>
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-ink-muted">
            {request.loading
              ? t('finance.payment.loading')
              : fetched
                ? t('finance.payment.fetched', { time: fetched })
                : ''}
          </p>
          <Button tone="secondary" busy={request.loading} onClick={() => void reload()}>
            {t('finance.refresh')}
          </Button>
        </div>
      </div>

      {request.failure && !view ? (
        <Notice tone="error" role="alert" title={t('finance.payment.failed')}>
          <p>{t(readFailureKey(request.failure))}</p>
        </Notice>
      ) : null}
      {request.failure && view ? (
        <Notice tone="warning" role="alert" title={t('finance.payment.refreshFailed')}>
          <p>{t(readFailureKey(request.failure))}</p>
        </Notice>
      ) : null}

      {view ? <PaymentSummary payment={view.payment} /> : null}
      {view?.detail ? (
        <>
          <ItemsTable detail={view.detail} />
          <RefundsTable detail={view.detail} />
          <HistoryList detail={view.detail} />
        </>
      ) : view ? (
        <Notice
          tone="pending"
          role="none"
          title={t(
            view.detailOutdated
              ? 'finance.payment.detailOutdated'
              : 'finance.payment.detailLoading',
          )}
        />
      ) : null}
    </>
  );
}

function PaymentSummary({ payment }: { payment: Payment }) {
  const { t } = useI18n();
  return (
    <Section id="payment-summary" title={t('finance.payment.summary')}>
      <div className="flex flex-wrap gap-2">
        {paymentBadges(payment).map((badge) => (
          <StatusBadge key={badge.key} badge={badge} />
        ))}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Amount label={t('finance.payment.amount')} cents={payment.amountCents} />
        <Amount label={t('finance.payment.refunded')} cents={payment.refundedAmountCents} />
        <Amount
          label={t('finance.payment.refundPending')}
          cents={payment.pendingRefundAmountCents}
        />
        <Amount label={t('finance.payment.refundable')} cents={payment.refundableAmountCents} />
      </dl>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        <Fact label={t('finance.payment.id')}>
          <code>{payment.id}</code>
        </Fact>
        <Fact label={t('finance.payment.orderId')}>
          <code>{payment.orderId}</code>
        </Fact>
        <Fact label={t('finance.payment.payer')}>
          {payment.payer.displayName} (<code>{payment.payer.id}</code>)
        </Fact>
        <Fact label={t('finance.payment.priceGroup')}>
          {t(`finance.priceGroup.${payment.priceGroup}`)}
        </Fact>
        <Fact label={t('finance.payment.place')}>
          {payment.mensa.name} · {payment.till.name}
        </Fact>
        <Fact label={t('finance.payment.created')}>
          <BerlinTime value={payment.createdAt} />
        </Fact>
        <Fact label={t('finance.payment.updated')}>
          <BerlinTime value={payment.updatedAt} />
        </Fact>
        <Fact label={t('finance.payment.version')}>{payment.version}</Fact>
      </dl>
    </Section>
  );
}

function Amount({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-control border border-line/30 p-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-xl font-bold">
        <Money cents={cents} />
      </dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function ItemsTable({ detail }: { detail: PaymentDetail }) {
  const { t, locale } = useI18n();
  return (
    <Section id="payment-items" title={t('finance.payment.items')}>
      <TableScroll label={t('finance.payment.items')}>
        <table className="w-full min-w-[30rem] border-collapse">
          <caption className="sr-only">{t('finance.payment.items')}</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>
                {t('finance.payment.item')}
              </th>
              <th scope="col" className={thNumber}>
                {t('finance.payment.quantity')}
              </th>
              <th scope="col" className={thNumber}>
                {t('finance.payment.unitPrice')}
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((item) => (
              <tr key={item.itemId}>
                <th scope="row" className={`${td} text-left font-normal`}>
                  {item.name[locale]}
                </th>
                <td className={tdNumber}>{item.quantity}</td>
                <td className={tdNumber}>
                  <Money cents={item.unitPriceCents} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2} className={`${td} text-left`}>
                {t('finance.payment.total')}
              </th>
              <td className={tdNumber}>
                <Money cents={detail.amountCents} strong />
              </td>
            </tr>
          </tfoot>
        </table>
      </TableScroll>
    </Section>
  );
}

function RefundsTable({ detail }: { detail: PaymentDetail }) {
  const { t } = useI18n();
  return (
    <Section id="payment-refunds" title={t('finance.payment.refunds')}>
      {detail.refunds.length === 0 ? (
        <p>{t('finance.payment.noRefunds')}</p>
      ) : (
        <TableScroll label={t('finance.payment.refunds')}>
          <table className="w-full min-w-[44rem] border-collapse">
            <caption className="sr-only">{t('finance.payment.refunds')}</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('finance.payment.refundId')}
                </th>
                <th scope="col" className={thNumber}>
                  {t('finance.col.amount')}
                </th>
                <th scope="col" className={th}>
                  {t('finance.col.status')}
                </th>
                <th scope="col" className={th}>
                  {t('finance.payment.reason')}
                </th>
                <th scope="col" className={th}>
                  {t('finance.payment.requested')}
                </th>
                <th scope="col" className={th}>
                  {t('finance.payment.updated')}
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.refunds.map((refund) => (
                <tr key={refund.id}>
                  <th scope="row" className={`${td} text-left font-normal`}>
                    <code>{refund.id}</code>
                  </th>
                  <td className={tdNumber}>
                    <Money cents={refund.amountCents} />
                  </td>
                  <td className={td}>
                    <StatusBadge badge={refundStatusBadge(refund.status)} />
                  </td>
                  {/* Server text, rendered as text: React escapes it, nothing is parsed as HTML. */}
                  <td className={td}>{refund.reason ?? t('finance.payment.noReason')}</td>
                  <td className={td}>
                    <BerlinTime value={refund.createdAt} />
                  </td>
                  <td className={td}>
                    <BerlinTime value={refund.updatedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Section>
  );
}

function HistoryList({ detail }: { detail: PaymentDetail }) {
  const { t } = useI18n();
  return (
    <Section id="payment-history" title={t('finance.payment.history')}>
      <p className="text-sm text-ink-muted">{t('finance.payment.historyOrder')}</p>
      <ol className="space-y-2">
        {detail.history.map((event, index) => (
          <li
            key={`${event.at}-${event.type}-${index}`}
            className="flex flex-wrap items-baseline gap-x-3 border-l-4 border-line/40 pl-3"
          >
            <BerlinTime value={event.at} />
            <span className="font-semibold">{t(historyEventKey(event.type))}</span>
            {event.amountCents !== null ? <Money cents={event.amountCents} /> : null}
            {event.refundId ? (
              <span className="text-sm text-ink-muted">
                {t('finance.payment.refundRef')} <code>{event.refundId}</code>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}
