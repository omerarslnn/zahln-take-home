import { useI18n } from '@mensa/shared/react';
import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { useFinanceSession } from './finance/session';
import { AttentionPage } from './pages/AttentionPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { PaymentPage } from './pages/PaymentPage';
import { ReportPage } from './pages/ReportPage';
import { SignInPage } from './pages/SignInPage';
import { TransactionsPage } from './pages/TransactionsPage';
import type { Route } from './routing';
import { useHashRoute } from './useHashRoute';

/** Sign-in first; then the page named by the address. A reload keeps the address but not the session. */
export function App() {
  const { locale } = useI18n();
  const { state } = useFinanceSession();
  const route = useHashRoute();

  useEffect(() => {
    // Screen readers pick pronunciation from the document language.
    document.documentElement.lang = locale;
  }, [locale]);

  return state.status === 'signed_in' ? <SignedIn route={route} /> : <SignInPage />;
}

function SignedIn({ route }: { route: Route }) {
  const { t } = useI18n();
  switch (route.page) {
    case 'report':
      return (
        <Layout
          route={route}
          title={t('finance.nav.report')}
          description={t('finance.page.report')}
        >
          <ReportPage day={route.day} />
        </Layout>
      );
    case 'attention':
      return (
        <Layout route={route} title={t('finance.nav.attention')}>
          <AttentionPage />
        </Layout>
      );
    case 'transactions':
      return (
        <Layout
          route={route}
          title={t('finance.nav.transactions')}
          description={t('finance.page.transactions')}
        >
          <TransactionsPage filter={route.filter} />
        </Layout>
      );
    case 'payment':
      return (
        <Layout route={route} title={t('finance.payment.title', { id: route.paymentId })}>
          <PaymentPage key={route.paymentId} paymentId={route.paymentId} back={route.back} />
        </Layout>
      );
    case 'diagnostics':
      return (
        <Layout route={route} title={t('finance.nav.diagnostics')}>
          <DiagnosticsPage />
        </Layout>
      );
    case 'not_found':
      return (
        <Layout route={route} title={t('finance.notFound.title')}>
          <p>{t('finance.notFound.body')}</p>
          <a href="#/report" className="font-semibold text-brand underline">
            {t('finance.nav.report')}
          </a>
        </Layout>
      );
  }
}
