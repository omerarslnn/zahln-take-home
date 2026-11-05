import type { Payment, PaymentDetail } from '@mensa/api';
import { formatBerlinTime } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import {
  BerlinTime,
  Button,
  ButtonLink,
  cardClass,
  FOCUS,
  Money,
  Notice,
  PageActions,
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
      <PageActions>
        <Button
          tone="secondary"
          icon="refresh"
          busy={request.loading}
          onClick={() => void reload()}
        >
          {t('finance.refresh')}
        </Button>
      </PageActions>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href={back ?? '#/transactions'} tone="tertiary" icon="arrowLeft">
          {t(
            back?.startsWith('#/attention')
              ? 'finance.payment.backAttention'
              : 'finance.payment.backList',
          )}
        </ButtonLink>
        <p role="status" className="text-caption text-ink-muted">
          {request.loading
            ? t('finance.payment.loading')
            : fetched
              ? t('finance.payment.fetched', { time: fetched })
              : ''}
        </p>
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
    <section aria-labelledby="payment-summary" className="grid gap-4 lg:grid-cols-3">
      <h2 id="payment-summary" className="sr-only">
        {t('finance.payment.summary')}
      </h2>
      <div className={`${cardClass} space-y-5 p-6 lg:col-span-2`}>
        <div className="flex flex-wrap items-center gap-2">
          {paymentBadges(payment).map((badge) => (
            <StatusBadge key={badge.key} badge={badge} />
          ))}
        </div>
        <div>
          <p className="text-caption font-semibold text-ink-muted">{t('finance.payment.amount')}</p>
          <p className="text-display font-bold text-ink">
            <Money cents={payment.amountCents} />
          </p>
          <p className="text-ink-muted">
            {t('finance.payment.priceGroup')}: {t(`finance.priceGroup.${payment.priceGroup}`)}
          </p>
        </div>
        <dl className="grid gap-x-8 gap-y-4 border-t border-line-subtle pt-5 sm:grid-cols-2">
          <Fact label={t('finance.payment.payer')}>
            {payment.payer.displayName} <code className="text-caption">({payment.payer.id})</code>
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
          <Fact label={t('finance.payment.id')}>
            <Identifier value={payment.id} what={t('finance.payment.id')} />
          </Fact>
          <Fact label={t('finance.payment.orderId')}>
            <Identifier value={payment.orderId} what={t('finance.payment.orderId')} />
          </Fact>
          <Fact label={t('finance.payment.version')}>{payment.version}</Fact>
        </dl>
      </div>
      <dl className={`${cardClass} divide-y divide-line-subtle self-start px-6 py-2`}>
        <Amount label={t('finance.payment.refunded')} cents={payment.refundedAmountCents} />
        <Amount
          label={t('finance.payment.refundPending')}
          cents={payment.pendingRefundAmountCents}
        />
        <Amount
          label={t('finance.payment.refundable')}
          cents={payment.refundableAmountCents}
          strong
        />
      </dl>
    </section>
  );
}

function Amount({
  label,
  cents,
  strong = false,
}: {
  label: string;
  cents: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`text-headline ${strong ? 'font-bold' : 'font-semibold'} text-ink`}>
        <Money cents={cents} />
      </dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-caption font-semibold text-ink-muted">{label}</dt>
      <dd className="break-words text-ink">{children}</dd>
    </div>
  );
}

/** An ID in a monospace font, with a copy button where the browser allows the clipboard. */
function Identifier({ value, what }: { value: string; what: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);
  const canCopy = window.isSecureContext && 'clipboard' in navigator;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <code className="break-all">{value}</code>
      {canCopy ? (
        <>
          <button
            type="button"
            aria-label={t('finance.copy', { what })}
            title={t('finance.copy', { what })}
            onClick={() =>
              void navigator.clipboard.writeText(value).then(
                () => setCopied(true),
                () => undefined,
              )
            }
            className={`inline-flex min-h-touch min-w-touch items-center justify-center rounded-control text-brand hover:bg-brand-subtle ${FOCUS}`}
          >
            <Icon name={copied ? 'check' : 'copy'} size={18} />
          </button>
          <span aria-live="polite" className="sr-only">
            {copied ? t('finance.copied', { what }) : ''}
          </span>
        </>
      ) : null}
    </span>
  );
}

function ItemsTable({ detail }: { detail: PaymentDetail }) {
  const { t, locale } = useI18n();
  return (
    <Section id="payment-items" title={t('finance.payment.items')} flush>
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
    <Section id="payment-refunds" title={t('finance.payment.refunds')} flush>
      {detail.refunds.length === 0 ? (
        <p className="px-5 pb-4 text-ink-muted">{t('finance.payment.noRefunds')}</p>
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
                    <code className="text-caption">{refund.id}</code>
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
    <Section
      id="payment-history"
      title={t('finance.payment.history')}
      description={t('finance.payment.historyOrder')}
    >
      <ol className="relative space-y-4 border-l-2 border-line-subtle pl-6">
        {detail.history.map((event, index) => (
          <li key={`${event.at}-${event.type}-${index}`} className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-[33px] top-1 h-4 w-4 rounded-full border-2 border-brand bg-surface"
            />
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-semibold text-ink">{t(historyEventKey(event.type))}</span>
              {event.amountCents !== null ? <Money cents={event.amountCents} /> : null}
            </p>
            <p className="flex flex-wrap gap-x-3 text-caption text-ink-muted">
              <BerlinTime value={event.at} />
              {event.refundId ? (
                <span>
                  {t('finance.payment.refundRef')} <code>{event.refundId}</code>
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
