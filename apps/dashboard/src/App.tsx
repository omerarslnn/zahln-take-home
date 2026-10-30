import {
  berlinDateKey,
  colors,
  formatBerlinDateTime,
  formatCents,
  type ColorToken,
} from '@mensa/shared';
import { useI18n, useNow } from '@mensa/shared/react';
import { useEffect, type ReactNode } from 'react';
import { ConnectionCheck } from './ConnectionCheck';
import { LanguageSwitch } from './LanguageSwitch';

const SWATCHES: ColorToken[] = ['brand', 'ink', 'inkMuted', 'success', 'warning', 'danger'];

/** Foundation shell: proves shared tokens, translations, formatting and the API transport on the web. */
export function App() {
  const { t, locale } = useI18n();

  useEffect(() => {
    // Screen readers pick pronunciation from the document language.
    document.documentElement.lang = locale;
    document.title = t('dashboard.title');
  }, [locale, t]);

  const now = useNow();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
          <p className="mt-2 inline-block rounded-control bg-warning px-2 py-1 text-sm font-semibold text-white">
            {t('foundation.badge')}
          </p>
        </div>
        <LanguageSwitch />
      </header>

      <Panel>
        <p>{t('foundation.notice')}</p>
        <p className="mt-2 text-ink-muted">{t('dashboard.next')}</p>
      </Panel>

      <Panel title={t('foundation.tokens')}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SWATCHES.map((token) => (
            <li key={token} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-8 w-8 rounded-control border border-line"
                style={{ backgroundColor: colors[token] }}
              />
              <span>
                {token} <span className="text-ink-muted">{colors[token]}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t('foundation.formatting')}>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-ink-muted">{t('foundation.sampleAmount')}</dt>
          <dd className="font-semibold">{formatCents(1250, locale)}</dd>
          <dt className="text-ink-muted">{t('foundation.berlinTime')}</dt>
          <dd className="font-semibold">{formatBerlinDateTime(now, locale)}</dd>
          <dt className="text-ink-muted">{t('foundation.reportDay')}</dt>
          <dd className="font-semibold">{berlinDateKey(now)}</dd>
        </dl>
      </Panel>

      <ConnectionCheck />
    </main>
  );
}

function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-surface p-4 shadow-sm">
      {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}
