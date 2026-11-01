import type { MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { candidateId } from '../api';
import { useFinanceSession } from '../finance/session';
import type { Route } from '../routing';
import { LanguageSwitch } from './LanguageSwitch';
import { Button, FOCUS, linkClass } from './ui';

const NAV: { page: Route['page']; href: string; key: MessageKey }[] = [
  { page: 'report', href: '#/report', key: 'finance.nav.report' },
  { page: 'attention', href: '#/attention', key: 'finance.nav.attention' },
  { page: 'transactions', href: '#/transactions', key: 'finance.nav.transactions' },
];

/**
 * The signed-in frame: header with account, language and sign-out, the main navigation, and the
 * page. When the page changes, focus moves to its heading and the document title follows, so a
 * screen reader announces where the user is; a new filter on the same page keeps focus where it is.
 */
export function Layout({
  route,
  title,
  children,
}: {
  route: Route;
  title: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { state, signOut } = useFinanceSession();
  const user = state.status === 'signed_in' ? state.services.user : null;
  const heading = useRef<HTMLHeadingElement>(null);
  const page = route.page === 'payment' ? `payment:${route.paymentId}` : route.page;

  useEffect(() => {
    heading.current?.focus();
  }, [page]);
  useEffect(() => {
    document.title = `${title} · ${t('dashboard.title')}`;
  }, [title, t]);

  return (
    <div className="min-h-screen">
      <button
        type="button"
        onClick={() => heading.current?.focus()}
        className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-control focus:bg-surface focus:px-4 focus:py-3 ${FOCUS}`}
      >
        {t('finance.skipToContent')}
      </button>
      <header className="border-b border-line/30 bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-lg font-bold">{t('dashboard.title')}</p>
          <div className="flex flex-wrap items-center gap-3">
            {user ? (
              <p className="text-sm text-ink-muted">
                {t('finance.signedInAs', { name: user.displayName })}
              </p>
            ) : null}
            <LanguageSwitch />
            <Button tone="secondary" onClick={signOut}>
              {t('finance.signOut')}
            </Button>
          </div>
        </div>
        <nav aria-label={t('finance.nav.label')} className="mx-auto max-w-6xl px-4">
          <ul className="flex flex-wrap gap-1">
            {NAV.map((item) => {
              const current = route.page === item.page;
              return (
                <li key={item.page}>
                  <a
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={`inline-flex min-h-touch items-center border-b-4 px-3 font-semibold ${FOCUS} ${
                      current ? 'border-brand text-ink' : 'border-transparent text-brand'
                    }`}
                  >
                    {t(item.key)}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold outline-none">
          {title}
        </h1>
        {children}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-sm text-ink-muted">
        <p>
          {t('finance.footer', { candidate: candidateId ?? '–' })}{' '}
          <a href="#/diagnostics" className={linkClass}>
            {t('finance.nav.diagnostics')}
          </a>
        </p>
      </footer>
    </div>
  );
}
