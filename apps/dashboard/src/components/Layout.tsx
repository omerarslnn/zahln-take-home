import type { MessageKey } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { candidateId } from '../api';
import { useFinanceSession } from '../finance/session';
import type { Route } from '../routing';
import { Icon, type IconName } from './Icon';
import { LanguageSwitch } from './LanguageSwitch';
import { Button, FOCUS, linkClass, PageActionsTarget } from './ui';

const NAV: { page: Route['page']; href: string; key: MessageKey; icon: IconName }[] = [
  { page: 'report', href: '#/report', key: 'finance.nav.report', icon: 'report' },
  {
    page: 'transactions',
    href: '#/transactions',
    key: 'finance.nav.transactions',
    icon: 'payments',
  },
  { page: 'attention', href: '#/attention', key: 'finance.nav.attention', icon: 'attention' },
];

/** The brand mark and name, shared by the signed-in header and the sign-in page. */
export function BrandMark() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-control bg-brand text-brand-on">
        <Icon name="brand" size={22} />
      </span>
      <span className="leading-tight">
        <span className="block font-bold text-ink">{t('dashboard.title')}</span>
        <span className="block text-caption text-ink-muted">{t('finance.brand.subtitle')}</span>
      </span>
    </div>
  );
}

/**
 * The signed-in frame: header with account, language and sign-out, the main navigation, and the
 * page with its heading and actions. When the page changes, focus moves to its heading and the
 * document title follows, so a screen reader announces where the user is; a new filter on the
 * same page keeps focus where it is.
 */
export function Layout({
  route,
  title,
  description,
  children,
}: {
  route: Route;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { state, signOut } = useFinanceSession();
  const user = state.status === 'signed_in' ? state.services.user : null;
  const heading = useRef<HTMLHeadingElement>(null);
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  const page = route.page === 'payment' ? `payment:${route.paymentId}` : route.page;
  // The payment detail belongs to the list it was opened from.
  const section =
    route.page === 'payment'
      ? route.back?.startsWith('#/attention')
        ? 'attention'
        : 'transactions'
      : route.page;

  useEffect(() => {
    heading.current?.focus();
  }, [page]);
  useEffect(() => {
    document.title = `${title} · ${t('dashboard.title')}`;
  }, [title, t]);

  return (
    <div className="flex min-h-screen flex-col">
      <button
        type="button"
        onClick={() => heading.current?.focus()}
        className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-control focus:bg-surface focus:px-4 focus:py-3 ${FOCUS}`}
      >
        {t('finance.skipToContent')}
      </button>
      <header className="border-b border-line-subtle bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
          <BrandMark />
          <div className="flex flex-wrap items-center gap-2">
            {user ? (
              <p className="mr-1 flex items-center gap-2 text-caption text-ink-muted">
                <Icon name="user" size={16} />
                {t('finance.signedInAs', { name: user.displayName })}
              </p>
            ) : null}
            <LanguageSwitch />
            <Button tone="tertiary" icon="logout" onClick={signOut}>
              {t('finance.signOut')}
            </Button>
          </div>
        </div>
        <nav
          aria-label={t('finance.nav.label')}
          className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6 lg:px-8"
        >
          <ul className="flex gap-1 whitespace-nowrap">
            {NAV.map((item) => {
              const current = route.page === item.page;
              return (
                <li key={item.page}>
                  <a
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={`inline-flex min-h-touch items-center gap-2 border-b-[3px] px-3 font-semibold transition-colors motion-reduce:transition-none ${FOCUS} ${
                      section === item.page
                        ? 'border-brand text-brand'
                        : 'border-transparent text-ink-muted hover:border-line-subtle hover:text-ink'
                    }`}
                  >
                    <Icon name={item.icon} size={18} />
                    {t(item.key)}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-3xl space-y-1">
            <h1
              ref={heading}
              tabIndex={-1}
              className="break-words text-title font-bold text-ink outline-none"
            >
              {title}
            </h1>
            {description ? <p className="text-ink-muted">{description}</p> : null}
          </div>
          <div ref={setActions} className="flex flex-wrap items-center gap-2 empty:hidden" />
        </div>
        <PageActionsTarget.Provider value={actions}>{children}</PageActionsTarget.Provider>
      </main>
      <footer className="border-t border-line-subtle bg-surface">
        <p className="mx-auto max-w-7xl px-4 py-4 text-caption text-ink-muted sm:px-6 lg:px-8">
          {t('finance.footer', { candidate: candidateId ?? '–' })}{' '}
          <a href="#/diagnostics" className={linkClass}>
            {t('finance.nav.diagnostics')}
          </a>
        </p>
      </footer>
    </div>
  );
}
