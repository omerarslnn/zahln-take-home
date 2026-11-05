import type { Mensa, PaymentStatus } from '@mensa/api';
import type { MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useEffect, useState, type ReactNode } from 'react';
import { ListStatus, PaymentTable } from '../components/PaymentTable';
import { Icon } from '../components/Icon';
import { Button, cardClass, FOCUS, Notice, PageActions, Section } from '../components/ui';
import {
  filterKey,
  filterProblem,
  knownFilter,
  NO_FILTER,
  SEARCH_MAX_LENGTH,
  withMensa,
  type AttentionFilter,
  type TransactionFilter,
} from '../finance/filters';
import { useExport, useMensas, usePaymentList, type ExportState } from '../finance/hooks';
import { useFinance } from '../finance/session';
import { exportFailureKey } from '../finance/text';
import { routeHref } from '../routing';
import { navigate } from '../useHashRoute';

const STATUS_OPTIONS: { value: PaymentStatus; key: MessageKey }[] = [
  { value: 'pending', key: 'finance.status.pending' },
  { value: 'confirmed', key: 'finance.status.confirmed' },
  { value: 'declined', key: 'finance.status.declined' },
];

const ATTENTION_OPTIONS: { value: AttentionFilter; key: MessageKey }[] = [
  { value: 'any', key: 'finance.filters.attentionAny' },
  { value: 'yes', key: 'finance.filters.attentionYes' },
  { value: 'no', key: 'finance.filters.attentionNo' },
];

/**
 * Payments matching the applied filters, a page at a time, with a CSV export of all of them. The
 * applied filter lives in the address (#/transactions?…), so a reload or a shared link shows the
 * same list; editing the form changes nothing until "Apply filters".
 */
export function TransactionsPage({ filter }: { filter: TransactionFilter }) {
  const services = useFinance();
  const { t } = useI18n();
  const mensas = useMensas(services);
  const applied = mensas.mensas ? knownFilter(filter, mensas.mensas) : filter;
  const key = filterKey(applied);
  const list = usePaymentList(services, applied);
  const exporter = useExport(services);
  const { state: exportState, cancel: cancelExport } = exporter;

  // An export belongs to the filter it started with: a different filter ends it, unsaved.
  useEffect(() => {
    if (exportState.phase === 'running' && exportState.key !== key) cancelExport('filter');
  }, [key, exportState, cancelExport]);

  const running = exportState.phase === 'running';

  return (
    <>
      <PageActions>
        <Button
          icon="download"
          busy={running}
          aria-describedby="export-scope"
          onClick={() => void exporter.start(applied)}
        >
          {running ? t('finance.export.running') : t('finance.export.start')}
        </Button>
      </PageActions>
      <ExportStatus
        filter={applied}
        state={exportState}
        onCancel={() => cancelExport('user')}
        onSave={exporter.save}
        onRetry={() => void exporter.start(applied)}
      />
      <FilterForm
        key={key}
        filter={applied}
        mensas={mensas.mensas}
        mensasFailed={mensas.failure !== null}
        onRetryMensas={mensas.reload}
      />
      <AppliedFilters filter={applied} mensas={mensas.mensas} />
      <Section
        id="transactions-list"
        title={t('finance.transactions.listTitle')}
        description={t('finance.transactions.order')}
        flush
      >
        {list.rows.length > 0 ? (
          <PaymentTable
            rows={list.rows}
            caption={t('finance.transactions.listTitle')}
            back={routeHref({ page: 'transactions', filter: applied })}
          />
        ) : null}
        <ListStatus
          state={list.state}
          started={list.started}
          shown={list.rows.length}
          emptyText={t('finance.transactions.empty')}
          onMore={list.loadMore}
          onRetry={list.retry}
        />
      </Section>
    </>
  );
}

const fieldClass = `min-h-touch w-full rounded-control border-2 border-line bg-surface px-3 text-ink ${FOCUS}`;

function FilterForm({
  filter,
  mensas,
  mensasFailed,
  onRetryMensas,
}: {
  filter: TransactionFilter;
  mensas: Mensa[] | null;
  mensasFailed: boolean;
  onRetryMensas: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(filter);
  const problem = filterProblem(draft);
  const set = (change: Partial<TransactionFilter>) =>
    setDraft((current) => ({ ...current, ...change }));
  const tillGroups = (mensas ?? []).filter((mensa) => !draft.mensaId || mensa.id === draft.mensaId);

  return (
    <form
      aria-labelledby="filters-title"
      className={`${cardClass} space-y-4 p-5`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem)
          navigate(
            routeHref({ page: 'transactions', filter: { ...draft, q: draft.q?.trim() || null } }),
          );
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-control bg-brand-subtle text-brand">
          <Icon name="filter" />
        </span>
        <div>
          <h2 id="filters-title" className="text-headline font-semibold text-ink">
            {t('finance.filters.title')}
          </h2>
          <p className="text-caption text-ink-muted">{t('finance.filters.combined')}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="filter-mensa" label={t('finance.filters.mensa')}>
          <select
            id="filter-mensa"
            value={draft.mensaId ?? ''}
            disabled={!mensas}
            onChange={(event) =>
              setDraft(withMensa(draft, event.target.value || null, mensas ?? []))
            }
            className={fieldClass}
          >
            <option value="">{t('finance.filters.allMensas')}</option>
            {(mensas ?? []).map((mensa) => (
              <option key={mensa.id} value={mensa.id}>
                {mensa.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="filter-till" label={t('finance.filters.till')}>
          <select
            id="filter-till"
            value={draft.tillId ?? ''}
            disabled={!mensas}
            onChange={(event) => set({ tillId: event.target.value || null })}
            className={fieldClass}
          >
            <option value="">{t('finance.filters.allTills')}</option>
            {tillGroups.map((mensa) => (
              <optgroup key={mensa.id} label={mensa.name}>
                {mensa.tills.map((till) => (
                  <option key={till.id} value={till.id}>
                    {till.name} ({mensa.name})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field id="filter-status" label={t('finance.filters.status')}>
          <select
            id="filter-status"
            value={draft.status ?? ''}
            onChange={(event) =>
              set({
                status:
                  STATUS_OPTIONS.find((option) => option.value === event.target.value)?.value ??
                  null,
              })
            }
            className={fieldClass}
          >
            <option value="">{t('finance.filters.anyStatus')}</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="filter-attention" label={t('finance.filters.attention')}>
          <select
            id="filter-attention"
            value={draft.attention}
            onChange={(event) =>
              set({
                attention:
                  ATTENTION_OPTIONS.find((option) => option.value === event.target.value)?.value ??
                  'any',
              })
            }
            className={fieldClass}
          >
            {ATTENTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="filter-from" label={t('finance.filters.from')}>
          <input
            id="filter-from"
            type="date"
            value={draft.fromDay ?? ''}
            onChange={(event) => set({ fromDay: event.target.value || null })}
            aria-describedby="filter-days-hint"
            className={fieldClass}
          />
        </Field>
        <Field id="filter-to" label={t('finance.filters.to')}>
          <input
            id="filter-to"
            type="date"
            value={draft.toDay ?? ''}
            onChange={(event) => set({ toDay: event.target.value || null })}
            aria-describedby="filter-days-hint"
            aria-invalid={problem === 'range_reversed' || undefined}
            className={fieldClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field id="filter-q" label={t('finance.filters.search')}>
            <input
              id="filter-q"
              type="search"
              value={draft.q ?? ''}
              maxLength={SEARCH_MAX_LENGTH}
              onChange={(event) => set({ q: event.target.value || null })}
              aria-describedby="filter-q-hint"
              autoComplete="off"
              spellCheck={false}
              className={fieldClass}
            />
          </Field>
          <p id="filter-q-hint" className="mt-1 text-caption text-ink-muted">
            {t('finance.filters.searchHint')}
          </p>
        </div>
      </div>
      <p id="filter-days-hint" className="text-caption text-ink-muted">
        {t('finance.filters.daysHint')}
      </p>
      {problem ? (
        <p role="alert" className="font-semibold text-danger">
          {t('finance.filters.rangeReversed')}
        </p>
      ) : null}
      {mensasFailed ? (
        <Notice tone="warning" title={t('finance.filters.mensasFailed')}>
          <Button tone="secondary" onClick={onRetryMensas}>
            {t('common.retry')}
          </Button>
        </Notice>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line-subtle pt-4">
        <Button
          tone="secondary"
          icon="close"
          onClick={() => navigate(routeHref({ page: 'transactions', filter: NO_FILTER }))}
        >
          {t('finance.filters.reset')}
        </Button>
        <Button type="submit" icon="check" disabled={problem !== null}>
          {t('finance.filters.apply')}
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-caption font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

/** The applied filter in words, so it is clear what an export contains. */
function useFilterSummary(filter: TransactionFilter, mensas: Mensa[] | null): string {
  const { t } = useI18n();
  const mensa = mensas?.find((candidate) => candidate.id === filter.mensaId);
  const till = mensas
    ?.flatMap((candidate) => candidate.tills)
    .find((candidate) => candidate.id === filter.tillId);
  const parts = [
    filter.mensaId ? (mensa?.name ?? filter.mensaId) : null,
    filter.tillId ? (till?.name ?? filter.tillId) : null,
    filter.status ? t(`finance.status.${filter.status}`) : null,
    filter.fromDay || filter.toDay
      ? t('finance.filters.summaryDays', { from: filter.fromDay ?? '…', to: filter.toDay ?? '…' })
      : null,
    filter.attention === 'any'
      ? null
      : t(
          filter.attention === 'yes'
            ? 'finance.filters.attentionYes'
            : 'finance.filters.attentionNo',
        ),
    filter.q ? t('finance.filters.summarySearch', { q: filter.q }) : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : t('finance.filters.summaryNone');
}

/** The applied filters in words, and what an export contains (the Export button points here). */
function AppliedFilters({ filter, mensas }: { filter: TransactionFilter; mensas: Mensa[] | null }) {
  const { t } = useI18n();
  const summary = useFilterSummary(filter, mensas);
  return (
    <div className="flex gap-3 rounded-card border border-brand-line bg-brand-subtle px-5 py-4">
      <span className="mt-0.5 text-brand">
        <Icon name="info" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-ink">
          <span className="font-semibold">{t('finance.export.filters')}</span> {summary}
        </p>
        <p id="export-scope" className="text-caption text-ink-muted">
          {t('finance.export.scope')}
        </p>
      </div>
    </div>
  );
}

/**
 * Where the export says what it is doing. One visually hidden live region speaks the start and the
 * outcome once each (not every page read); the panel shows the details while there is something to
 * say about the applied filter, with the action that fits: Cancel, Save, Try again.
 */
function ExportStatus({
  filter,
  state,
  onCancel,
  onSave,
  onRetry,
}: {
  filter: TransactionFilter;
  state: ExportState;
  onCancel: () => void;
  onSave: () => void;
  onRetry: () => void;
}) {
  const { t, locale } = useI18n();
  const sameFilter = state.phase !== 'idle' && state.key === filterKey(filter);
  // Counts in the reader's language: 5,595 / 5.595.
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const counts =
    state.phase === 'done'
      ? { payments: number(state.payments), pages: number(state.pages) }
      : undefined;
  const spoken =
    state.phase === 'running'
      ? t('finance.export.running')
      : state.phase === 'done' && sameFilter && counts
        ? `${t(state.saved ? 'finance.export.done' : 'finance.export.ready', counts)} ${t(
            state.saved ? 'finance.export.file' : 'finance.export.saveHint',
            { name: state.fileName },
          )}`
        : state.phase === 'failed' && sameFilter
          ? `${t('finance.export.failed')} ${t(exportFailureKey(state.failure))}`
          : state.phase === 'cancelled'
            ? t(
                state.why === 'filter'
                  ? 'finance.export.cancelledFilter'
                  : 'finance.export.cancelled',
              )
            : '';

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {spoken}
      </p>
      {spoken ? (
        <section aria-labelledby="export-title">
          <h2 id="export-title" className="sr-only">
            {t('finance.export.title')}
          </h2>
          {state.phase === 'running' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand-line bg-brand-subtle px-5 py-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand border-r-transparent motion-reduce:animate-none"
                />
                <p className="font-semibold text-ink">
                  {t('finance.export.progress', {
                    pages: number(state.progress.pages),
                    payments: number(state.progress.payments),
                  })}
                </p>
              </div>
              <Button tone="secondary" icon="close" onClick={onCancel}>
                {t('finance.export.cancel')}
              </Button>
            </div>
          ) : null}
          {state.phase === 'done' ? (
            <Notice
              tone="ok"
              role="none"
              title={t(state.saved ? 'finance.export.done' : 'finance.export.ready', counts)}
            >
              <p className="flex items-center gap-2">
                <Icon name="file" size={18} />
                <span className="break-all">
                  {t(state.saved ? 'finance.export.file' : 'finance.export.saveHint', {
                    name: state.fileName,
                  })}
                </span>
              </p>
              <p className="text-caption text-ink-muted">{t('finance.export.columns')}</p>
              <Button tone={state.saved ? 'secondary' : 'primary'} icon="download" onClick={onSave}>
                {t(state.saved ? 'finance.export.saveAgain' : 'finance.export.save')}
              </Button>
            </Notice>
          ) : null}
          {state.phase === 'failed' ? (
            <Notice tone="error" role="none" title={t('finance.export.failed')}>
              <p>{t(exportFailureKey(state.failure))}</p>
              <p>{t('finance.export.noFile')}</p>
              <Button tone="secondary" icon="refresh" onClick={onRetry}>
                {t('common.retry')}
              </Button>
            </Notice>
          ) : null}
          {state.phase === 'cancelled' ? (
            <Notice
              tone="neutral"
              role="none"
              title={t(
                state.why === 'filter'
                  ? 'finance.export.cancelledFilter'
                  : 'finance.export.cancelled',
              )}
            />
          ) : null}
        </section>
      ) : null}
    </>
  );
}
