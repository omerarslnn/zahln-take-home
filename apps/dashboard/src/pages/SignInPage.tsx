import { useI18n } from '@mensa/shared/react';
import { useEffect } from 'react';
import { FINANCE_USERNAME, missingEnvNames } from '../api';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { Button, Notice } from '../components/ui';
import { useFinanceSession } from '../finance/session';

/**
 * Sign-in with the mock API's seeded finance account. The password comes from the build's public
 * demo configuration (VITE_SEEDED_PASSWORD), so there is nothing to type; the page says so plainly.
 * The route in the address bar is kept, so after signing in the requested page opens.
 */
export function SignInPage() {
  const { t } = useI18n();
  const { state, signIn } = useFinanceSession();
  const busy = state.status === 'signing_in';
  const failure = state.status === 'signed_out' ? state.failure : null;

  useEffect(() => {
    document.title = `${t('finance.signIn.title')} · ${t('dashboard.title')}`;
  }, [t]);

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg font-bold">{t('dashboard.title')}</p>
        <LanguageSwitch />
      </div>
      <h1 className="text-2xl font-bold">{t('finance.signIn.title')}</h1>
      <section className="space-y-3 rounded-card bg-surface p-4 shadow-sm">
        <p>{t('finance.signIn.body')}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-ink-muted">{t('finance.signIn.account')}</dt>
          <dd className="font-semibold">{FINANCE_USERNAME}</dd>
        </dl>
        <p className="text-sm text-ink-muted">{t('finance.signIn.demoNote')}</p>
        {missingEnvNames.length > 0 ? (
          <Notice
            tone="error"
            role="alert"
            title={t('connection.configMissing', { names: missingEnvNames.join(', ') })}
          />
        ) : (
          <Button busy={busy} onClick={() => void signIn()}>
            {busy ? t('finance.signIn.busy') : t('finance.signIn.action')}
          </Button>
        )}
        {failure ? (
          <Notice tone="error" role="alert" title={t(`finance.signIn.failure.${failure}`)} />
        ) : null}
        <p className="text-sm text-ink-muted">{t('finance.signIn.sessionNote')}</p>
      </section>
    </main>
  );
}
