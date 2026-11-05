import type { DailyTotals, TillTotals } from '@mensa/api';
import type { DailyReportState } from '@mensa/domain/finance';
import {
  addCalendarDays,
  berlinDateKey,
  formatBerlinTime,
  formatCalendarDay,
  parseCalendarDay,
} from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import {
  Button,
  ButtonLink,
  cardClass,
  FOCUS,
  Money,
  Notice,
  PageActions,
  Section,
  Skeleton,
  StatCard,
  TableScroll,
  td,
  tdNumber,
  th,
  thNumber,
} from '../components/ui';
import { useDailyReport } from '../finance/hooks';
import { useFinance } from '../finance/session';
import { readFailureKey } from '../finance/text';
import { useServerNow } from '../finance/useServerNow';
import { routeHref } from '../routing';
import { navigate } from '../useHashRoute';

/**
 * Daily totals straight from GET /reports/daily-totals for one Berlin day: overall, per mensa and
 * per till. Nothing here is added up from payment lists. The time shown is when this copy was
 * fetched; reports carry no version or snapshot time, so it is not a "data as of" time.
 */
export function ReportPage({ day }: { day: string | null }) {
  const services = useFinance();
  // Today in Berlin by the server's clock (Date headers), not the browser's.
  const today = berlinDateKey(new Date(useServerNow()));
  const selected = day ?? today;
  const { state, refresh } = useDailyReport(services, selected);
  // Until the store has switched to the selected day, show nothing of the previous one.
  const current = state.day === selected ? state : null;

  const { t } = useI18n();
  return (
    <>
      <PageActions>
        <Button tone="secondary" icon="refresh" busy={current?.loading} onClick={refresh}>
          {current?.loading ? t('finance.loading') : t('finance.refresh')}
        </Button>
      </PageActions>
      <DayPicker key={selected} day={selected} />
      {current ? <ReportStatus state={current} onRefresh={refresh} /> : null}
      {current?.latest ? (
        <ReportTotals report={current.latest.report} />
      ) : current?.loading || !current ? (
        <TotalsLoading />
      ) : null}
      <HowCounted />
    </>
  );
}

function DayPicker({ day }: { day: string }) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState(day);
  const valid = parseCalendarDay(draft) !== null;
  return (
    <form
      aria-labelledby="report-day-title"
      className={`${cardClass} flex flex-wrap items-end justify-between gap-4 p-5`}
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) navigate(routeHref({ page: 'report', day: draft }));
      }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-control bg-brand-subtle text-brand">
          <Icon name="calendar" />
        </span>
        <div>
          <p className="text-caption font-semibold text-ink-muted">
            {t('finance.report.selected')}
          </p>
          <h2 id="report-day-title" className="text-headline font-semibold text-ink">
            {formatCalendarDay(day, locale)}
          </h2>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="report-day" className="text-caption font-semibold text-ink">
            {t('finance.report.day')}
          </label>
          <input
            id="report-day"
            type="date"
            required
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-describedby="report-day-hint"
            className={`min-h-touch rounded-control border-2 border-line bg-surface px-3 text-ink ${FOCUS}`}
          />
        </div>
        <Button type="submit" disabled={!valid}>
          {t('finance.report.show')}
        </Button>
        <ButtonLink
          href={routeHref({ page: 'report', day: addCalendarDays(day, -1) })}
          icon="chevronLeft"
        >
          {t('finance.report.previous')}
        </ButtonLink>
        <ButtonLink href="#/report">{t('finance.report.today')}</ButtonLink>
        <ButtonLink href={routeHref({ page: 'report', day: addCalendarDays(day, 1) })}>
          {t('finance.report.next')}
          <Icon name="chevronRight" />
        </ButtonLink>
      </div>
      <p id="report-day-hint" className="w-full text-caption text-ink-muted">
        {t('finance.report.dayHint')}
      </p>
    </form>
  );
}

function ReportStatus({ state, onRefresh }: { state: DailyReportState; onRefresh: () => void }) {
  const { t, locale } = useI18n();
  const fetched = state.latest ? formatBerlinTime(state.latest.fetchedAt, locale) : null;
  const refreshButton = (
    <Button tone="secondary" icon="refresh" busy={state.loading} onClick={onRefresh}>
      {state.loading ? t('finance.loading') : t('finance.refresh')}
    </Button>
  );

  if (state.failure && !state.latest) {
    // Nothing arrived for this day: no numbers at all, never zeros.
    return (
      <Notice tone="error" role="alert" title={t('finance.report.failed')}>
        <p>{t(readFailureKey(state.failure))}</p>
        {refreshButton}
      </Notice>
    );
  }
  if (state.failure && fetched) {
    return (
      <Notice tone="warning" role="alert" title={t('finance.report.refreshFailed')}>
        <p>{t(readFailureKey(state.failure))}</p>
        <p>{t('finance.report.showingFetched', { time: fetched })}</p>
        {refreshButton}
      </Notice>
    );
  }
  return (
    <div className="flex items-center gap-2 text-caption text-ink-muted">
      <Icon name="pending" size={16} />
      <p role="status">
        {state.loading && !fetched
          ? t('finance.report.loading')
          : state.loading && fetched
            ? t('finance.report.refreshing', { time: fetched })
            : fetched
              ? t('finance.report.fetched', { time: fetched })
              : ''}
      </p>
    </div>
  );
}

function ReportTotals({ report }: { report: DailyTotals }) {
  const { t, locale } = useI18n();
  const dayText = formatCalendarDay(report.date, locale);
  const quiet =
    report.paymentCount === 0 && report.refundedCents === 0 && report.pendingCount === 0;
  const negative = report.netCents < 0;

  return (
    <>
      <dl
        aria-label={t('finance.report.summary', { day: dayText })}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label={t('finance.report.gross')}
          icon="gross"
          value={<Money cents={report.grossCents} />}
          detail={t('finance.report.grossDetail', { count: report.paymentCount })}
        />
        <StatCard
          label={t('finance.report.refunded')}
          icon="refund"
          value={<Money cents={report.refundedCents} />}
          detail={t('finance.report.refundedDetail')}
        />
        <StatCard
          label={t('finance.report.net')}
          icon="net"
          value={
            <span className={negative ? 'text-danger' : ''}>
              <Money cents={report.netCents} />
            </span>
          }
          detail={t(negative ? 'finance.report.netNegative' : 'finance.report.netDetail')}
          tag={negative ? { key: 'finance.report.negative', tone: 'error' } : undefined}
        />
        <StatCard
          label={t('finance.report.pending')}
          icon="pending"
          value={<Money cents={report.pendingCents} />}
          detail={t('finance.report.pendingDetail', { count: report.pendingCount })}
        />
      </dl>
      {quiet ? (
        <Notice tone="neutral" role="none" title={t('finance.report.quiet', { day: dayText })} />
      ) : null}
      <Section id="report-places" title={t('finance.report.byPlace')} flush>
        <TableScroll label={t('finance.report.byPlace')}>
          <table className="w-full min-w-[46rem] border-collapse">
            <caption className="sr-only">{t('finance.report.caption', { day: dayText })}</caption>
            <thead>
              <tr>
                <th scope="col" className={`${th} sticky left-0`}>
                  {t('finance.report.col.place')}
                </th>
                <th scope="col" className={thNumber}>
                  {t('finance.report.col.confirmed')}
                </th>
                <th scope="col" className={thNumber}>
                  {t('finance.report.col.gross')}
                </th>
                <th scope="col" className={thNumber}>
                  {t('finance.report.col.refunded')}
                </th>
                <th scope="col" className={thNumber}>
                  {t('finance.report.col.net')}
                </th>
                <th scope="col" className={thNumber}>
                  {t('finance.report.col.pendingCount')}
                </th>
                <th scope="col" className={thNumber}>
                  {t('finance.report.col.pendingAmount')}
                </th>
              </tr>
            </thead>
            {report.mensas.map((mensa) => (
              <tbody key={mensa.mensa.id}>
                <TotalsRow label={mensa.mensa.name} totals={mensa} level="mensa" />
                {mensa.tills.map((till) => (
                  <TotalsRow
                    key={till.till.id}
                    label={till.till.name}
                    context={mensa.mensa.name}
                    totals={till}
                    level="till"
                  />
                ))}
              </tbody>
            ))}
            <tfoot>
              <TotalsRow label={t('finance.report.allMensas')} totals={report} level="total" />
            </tfoot>
          </table>
        </TableScroll>
      </Section>
    </>
  );
}

type Totals = Omit<TillTotals, 'till'>;

const ROW_LOOK = {
  mensa: { row: 'bg-canvas', head: 'bg-canvas font-semibold text-ink', strong: true },
  till: { row: '', head: 'bg-surface pl-10 font-normal text-ink', strong: false },
  total: { row: 'border-t-2 border-line', head: 'bg-surface font-bold text-ink', strong: true },
} as const;

function TotalsRow({
  label,
  context,
  totals,
  level,
}: {
  label: string;
  /** The mensa of a till row, for screen readers: several mensas have a "Kasse 1". */
  context?: string;
  totals: Totals;
  level: keyof typeof ROW_LOOK;
}) {
  const look = ROW_LOOK[level];
  const net = totals.netCents < 0 ? 'text-danger' : '';
  return (
    <tr className={look.row}>
      <th
        scope="row"
        // Sticky, so the mensa or till stays in view while a narrow screen scrolls the figures.
        className={`${td} sticky left-0 text-left ${look.head}`}
      >
        {label}
        {context ? <span className="sr-only"> ({context})</span> : null}
      </th>
      <td className={tdNumber}>{totals.paymentCount}</td>
      <td className={tdNumber}>
        <Money cents={totals.grossCents} strong={look.strong} />
      </td>
      <td className={tdNumber}>
        <Money cents={totals.refundedCents} />
      </td>
      <td className={`${tdNumber} ${net}`}>
        <Money cents={totals.netCents} strong={look.strong} />
      </td>
      <td className={tdNumber}>{totals.pendingCount}</td>
      <td className={tdNumber}>
        <Money cents={totals.pendingCents} />
      </td>
    </tr>
  );
}

/** The four figures' places while the first copy of a day is on its way (no numbers, no zeros). */
function TotalsLoading() {
  return (
    <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((card) => (
        <div key={card} className={`${cardClass} space-y-3 p-5`}>
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function HowCounted() {
  const { t } = useI18n();
  return (
    <Section id="report-how" title={t('finance.report.howTitle')}>
      <ul className="grid gap-3 md:grid-cols-2">
        {(
          [
            'finance.report.howPayments',
            'finance.report.howRefunds',
            'finance.report.howPending',
            'finance.report.howFetched',
          ] as const
        ).map((key) => (
          <li key={key} className="flex gap-3 text-ink">
            <span className="mt-0.5 text-brand">
              <Icon name="info" size={18} />
            </span>
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
