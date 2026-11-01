import { useI18n } from '@mensa/shared/react';
import { ListStatus, PaymentTable } from '../components/PaymentTable';
import { Section } from '../components/ui';
import { NO_FILTER, type TransactionFilter } from '../finance/filters';
import { usePaymentList } from '../finance/hooks';
import { useFinance } from '../finance/session';

const NEEDS_ATTENTION: TransactionFilter = { ...NO_FILTER, attention: 'yes' };

/**
 * GET /payments?needsAttention=true: payments the server flags for a person to look at. A flag is
 * not a verdict: such a payment can be pending or confirmed. The API offers no write to resolve a
 * flag, so this view explains and links to the full history; it does not pretend to act.
 */
export function AttentionPage() {
  const services = useFinance();
  const { t } = useI18n();
  const list = usePaymentList(services, NEEDS_ATTENTION);

  return (
    <>
      <section
        aria-labelledby="attention-reasons"
        className="space-y-2 rounded-card bg-surface p-4 shadow-sm"
      >
        <p>{t('finance.attention.intro')}</p>
        <h2 id="attention-reasons" className="font-semibold">
          {t('finance.attention.reasonsTitle')}
        </h2>
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">{t('finance.reason.pending_too_long')}</dt>
          <dd>{t('finance.attention.why.pending_too_long')}</dd>
          <dt className="font-semibold">{t('finance.reason.refund_pending_too_long')}</dt>
          <dd>{t('finance.attention.why.refund_pending_too_long')}</dd>
          <dt className="font-semibold">{t('finance.reason.refund_failed')}</dt>
          <dd>{t('finance.attention.why.refund_failed')}</dd>
        </dl>
      </section>
      <Section id="attention-list" title={t('finance.attention.listTitle')}>
        {list.rows.length > 0 ? (
          <PaymentTable
            rows={list.rows}
            caption={t('finance.attention.listTitle')}
            back="#/attention"
            showAge
          />
        ) : null}
        <ListStatus
          state={list.state}
          started={list.started}
          shown={list.rows.length}
          emptyText={t('finance.attention.empty')}
          onMore={list.loadMore}
          onRetry={list.retry}
        />
      </Section>
    </>
  );
}
