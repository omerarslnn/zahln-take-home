import type { Mensa, PaymentStatus } from '@mensa/api';
import type { MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useEffect, useState, type ReactNode } from 'react';
import { ListStatus, PaymentTable } from '../components/PaymentTable';
import { Button, FOCUS, Notice, Section } from '../components/ui';
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

  return (
    <>
      <FilterForm
        key={key}
        filter={applied}
        mensas={mensas.mensas}
        mensasFailed={mensas.failure !== null}
        onRetryMensas={mensas.reload}
      />
      <ExportPanel
        filter={applied}
        mensas={mensas.mensas}
        state={exportState}
        onStart={() => void exporter.start(applied)}
        onCancel={() => cancelExport('user')}
      />
      <Section id="transactions-list" title={t('finance.transactions.listTitle')}>
        <p className="text-sm text-ink-muted">{t('finance.transactions.order')}</p>
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

const fieldClass = `min-h-touch w-full rounded-control border-2 border-line bg-surface px-3 ${FOCUS}`;

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
      className="space-y-3 rounded-card bg-surface p-4 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem)
          navigate(
            routeHref({ page: 'transactions', filter: { ...draft, q: draft.q?.trim() || null } }),
          );
      }}
    >
      <h2 id="filters-title" className="text-lg font-semibold">
        {t('finance.filters.title')}
      </h2>
      <p className="text-sm text-ink-muted">{t('finance.filters.combined')}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <p id="filter-q-hint" className="mt-1 text-sm text-ink-muted">
            {t('finance.filters.searchHint')}
          </p>
        </div>
      </div>
      <p id="filter-days-hint" className="text-sm text-ink-muted">
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={problem !== null}>
          {t('finance.filters.apply')}
        </Button>
        <Button
          tone="secondary"
          onClick={() => navigate(routeHref({ page: 'transactions', filter: NO_FILTER }))}
        >
          {t('finance.filters.reset')}
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
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

function ExportPanel({
  filter,
  mensas,
  state,
  onStart,
  onCancel,
}: {
  filter: TransactionFilter;
  mensas: Mensa[] | null;
  state: ExportState;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const summary = useFilterSummary(filter, mensas);
  const sameFilter = state.phase !== 'idle' && state.key === filterKey(filter);

  return (
    <Section id="export" title={t('finance.export.title')}>
      <p>{t('finance.export.body')}</p>
      <p>
        <span className="font-semibold">{t('finance.export.filters')}</span> {summary}
      </p>
      <p className="text-sm text-ink-muted">{t('finance.export.consistency')}</p>
      <div aria-live="polite" className="space-y-2">
        {state.phase === 'running' ? (
          <p role="status">
            {t('finance.export.progress', {
              pages: state.progress.pages,
              payments: state.progress.payments,
            })}
          </p>
        ) : null}
        {state.phase === 'done' && sameFilter ? (
          <Notice
            tone="ok"
            role="none"
            title={t('finance.export.done', { payments: state.payments, pages: state.pages })}
          >
            <p>{t('finance.export.file', { name: state.fileName })}</p>
          </Notice>
        ) : null}
        {state.phase === 'failed' && sameFilter ? (
          <Notice tone="error" role="none" title={t('finance.export.failed')}>
            <p>{t(exportFailureKey(state.failure))}</p>
            <p>{t('finance.export.noFile')}</p>
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
      </div>
      {state.phase === 'running' ? (
        <Button tone="secondary" onClick={onCancel}>
          {t('finance.export.cancel')}
        </Button>
      ) : (
        <Button onClick={onStart}>{t('finance.export.start')}</Button>
      )}
    </Section>
  );
}
