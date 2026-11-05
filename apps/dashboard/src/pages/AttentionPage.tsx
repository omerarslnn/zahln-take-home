import { useI18n } from '@mensa/shared/react';
import { ListStatus, PaymentTable } from '../components/PaymentTable';
import { ButtonLink, cardClass, PageActions, Section, StatusBadge } from '../components/ui';
import { NO_FILTER, type TransactionFilter } from '../finance/filters';
import { usePaymentList } from '../finance/hooks';
import { useFinance } from '../finance/session';
import { attentionReasonKey, type AttentionReason } from '../finance/text';
import { routeHref } from '../routing';

const NEEDS_ATTENTION: TransactionFilter = { ...NO_FILTER, attention: 'yes' };
const REASONS: AttentionReason[] = ['pending_too_long', 'refund_pending_too_long', 'refund_failed'];

/**
 * GET /payments?needsAttention=true: payments the server flags for a person to look at. A flag is
 * not a verdict: such a payment can be pending or confirmed. The API offers no write to resolve a
 * flag, so this view explains and links to the full history; it does not pretend to act. The same
 * set can be filtered further and exported from Payments.
 */
export function AttentionPage() {
  const services = useFinance();
  const { t } = useI18n();
  const list = usePaymentList(services, NEEDS_ATTENTION);

  return (
    <>
      <PageActions>
        <ButtonLink
          href={routeHref({ page: 'transactions', filter: NEEDS_ATTENTION })}
          icon="filter"
        >
          {t('finance.attention.openInPayments')}
        </ButtonLink>
      </PageActions>
      <section aria-labelledby="attention-reasons" className="space-y-3">
        <div className="space-y-1">
          <h2 id="attention-reasons" className="text-headline font-semibold text-ink">
            {t('finance.attention.reasonsTitle')}
          </h2>
          <p className="max-w-3xl text-ink-muted">{t('finance.attention.intro')}</p>
        </div>
        <dl className="grid gap-4 md:grid-cols-3">
          {REASONS.map((reason) => (
            <div key={reason} className={`${cardClass} space-y-2 p-5`}>
              <dt>
                <StatusBadge badge={{ key: attentionReasonKey(reason), tone: 'warning' }} />
              </dt>
              <dd className="text-ink">{t(`finance.attention.why.${reason}`)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Section id="attention-list" title={t('finance.attention.listTitle')} flush>
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
