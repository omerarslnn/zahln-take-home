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
import {
  Button,
  FOCUS,
  Money,
  Notice,
  Section,
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

const secondaryLink = `inline-flex min-h-touch items-center rounded-control border-2 border-brand bg-surface px-4 font-semibold text-brand ${FOCUS}`;

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

  return (
    <>
      <DayPicker key={selected} day={selected} />
      {current ? <ReportStatus state={current} onRefresh={refresh} /> : null}
      {current?.latest ? <ReportTotals report={current.latest.report} /> : null}
      <HowCounted />
    </>
  );
}

function DayPicker({ day }: { day: string }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(day);
  const valid = parseCalendarDay(draft) !== null;
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-card bg-surface p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) navigate(routeHref({ page: 'report', day: draft }));
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="report-day" className="text-sm font-semibold">
          {t('finance.report.day')}
        </label>
        <input
          id="report-day"
          type="date"
          required
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-describedby="report-day-hint"
          className={`min-h-touch rounded-control border-2 border-line bg-surface px-3 ${FOCUS}`}
        />
      </div>
      <Button type="submit" disabled={!valid}>
        {t('finance.report.show')}
      </Button>
      <a
        href={routeHref({ page: 'report', day: addCalendarDays(day, -1) })}
        className={secondaryLink}
      >
        {t('finance.report.previous')}
      </a>
      <a
        href={routeHref({ page: 'report', day: addCalendarDays(day, 1) })}
        className={secondaryLink}
      >
        {t('finance.report.next')}
      </a>
      <a href="#/report" className={secondaryLink}>
        {t('finance.report.today')}
      </a>
      <p id="report-day-hint" className="w-full text-sm text-ink-muted">
        {t('finance.report.dayHint')}
      </p>
    </form>
  );
}

function ReportStatus({ state, onRefresh }: { state: DailyReportState; onRefresh: () => void }) {
  const { t, locale } = useI18n();
  const fetched = state.latest ? formatBerlinTime(state.latest.fetchedAt, locale) : null;
  const refreshButton = (
    <Button tone="secondary" busy={state.loading} onClick={onRefresh}>
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm text-ink-muted">
        {state.loading && !fetched
          ? t('finance.report.loading')
          : state.loading && fetched
            ? t('finance.report.refreshing', { time: fetched })
            : fetched
              ? t('finance.report.fetched', { time: fetched })
              : ''}
      </p>
      {refreshButton}
    </div>
  );
}

function ReportTotals({ report }: { report: DailyTotals }) {
  const { t, locale } = useI18n();
  const dayText = formatCalendarDay(report.date, locale);
  const quiet =
    report.paymentCount === 0 && report.refundedCents === 0 && report.pendingCount === 0;

  return (
    <>
      <dl
        aria-label={t('finance.report.summary', { day: dayText })}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Figure
          label={t('finance.report.gross')}
          cents={report.grossCents}
          detail={t('finance.report.grossDetail', { count: report.paymentCount })}
        />
        <Figure
          label={t('finance.report.refunded')}
          cents={report.refundedCents}
          detail={t('finance.report.refundedDetail')}
        />
        <Figure
          label={t('finance.report.net')}
          cents={report.netCents}
          detail={t(
            report.netCents < 0 ? 'finance.report.netNegative' : 'finance.report.netDetail',
          )}
        />
        <Figure
          label={t('finance.report.pending')}
          cents={report.pendingCents}
          detail={t('finance.report.pendingDetail', { count: report.pendingCount })}
        />
      </dl>
      {quiet ? (
        <Notice tone="neutral" role="none" title={t('finance.report.quiet', { day: dayText })} />
      ) : null}
      <Section id="report-places" title={t('finance.report.byPlace')}>
        <TableScroll label={t('finance.report.byPlace')}>
          <table className="w-full min-w-[46rem] border-collapse">
            <caption className="sr-only">{t('finance.report.caption', { day: dayText })}</caption>
            <thead>
              <tr>
                <th scope="col" className={`${th} sticky left-0 bg-surface`}>
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
                <TotalsRow label={mensa.mensa.name} totals={mensa} strong />
                {mensa.tills.map((till) => (
                  <TotalsRow
                    key={till.till.id}
                    label={till.till.name}
                    context={mensa.mensa.name}
                    totals={till}
                  />
                ))}
              </tbody>
            ))}
            <tfoot>
              <TotalsRow label={t('finance.report.allMensas')} totals={report} strong />
            </tfoot>
          </table>
        </TableScroll>
      </Section>
    </>
  );
}

type Totals = Omit<TillTotals, 'till'>;

function TotalsRow({
  label,
  context,
  totals,
  strong = false,
}: {
  label: string;
  /** The mensa of a till row, for screen readers: several mensas have a "Kasse 1". */
  context?: string;
  totals: Totals;
  strong?: boolean;
}) {
  return (
    <tr className={strong ? 'bg-canvas' : ''}>
      <th
        scope="row"
        // Sticky, so the mensa or till stays in view while a narrow screen scrolls the figures.
        className={`${td} sticky left-0 text-left ${strong ? 'bg-canvas font-semibold' : 'bg-surface pl-8 font-normal'}`}
      >
        {label}
        {context ? <span className="sr-only"> ({context})</span> : null}
      </th>
      <td className={tdNumber}>{totals.paymentCount}</td>
      <td className={tdNumber}>
        <Money cents={totals.grossCents} strong={strong} />
      </td>
      <td className={tdNumber}>
        <Money cents={totals.refundedCents} />
      </td>
      <td className={tdNumber}>
        <Money cents={totals.netCents} strong={strong} />
      </td>
      <td className={tdNumber}>{totals.pendingCount}</td>
      <td className={tdNumber}>
        <Money cents={totals.pendingCents} />
      </td>
    </tr>
  );
}

function Figure({ label, cents, detail }: { label: string; cents: number; detail: string }) {
  return (
    <div className="rounded-card bg-surface p-4 shadow-sm">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">
        <Money cents={cents} />
      </dd>
      <dd className="mt-1 text-sm text-ink-muted">{detail}</dd>
    </div>
  );
}

function HowCounted() {
  const { t } = useI18n();
  return (
    <Section id="report-how" title={t('finance.report.howTitle')}>
      <ul className="list-disc space-y-1 pl-5">
        <li>{t('finance.report.howPayments')}</li>
        <li>{t('finance.report.howRefunds')}</li>
        <li>{t('finance.report.howPending')}</li>
        <li>{t('finance.report.howFetched')}</li>
      </ul>
    </Section>
  );
}
