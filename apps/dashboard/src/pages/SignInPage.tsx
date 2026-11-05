import { useI18n } from '@mensa/shared/react';
import { useEffect } from 'react';
import { FINANCE_USERNAME, missingEnvNames } from '../api';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { BrandMark } from '../components/Layout';
import { Button, cardClass, Notice } from '../components/ui';
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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BrandMark />
        <LanguageSwitch />
      </div>
      <section aria-labelledby="sign-in-title" className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        <div className="space-y-2">
          <h1 id="sign-in-title" className="text-title font-bold text-ink">
            {t('finance.signIn.title')}
          </h1>
          <p className="text-ink-muted">{t('finance.signIn.body')}</p>
        </div>
        <dl className="flex flex-wrap items-baseline gap-x-3 rounded-control bg-canvas px-4 py-3">
          <dt className="text-caption font-semibold text-ink-muted">
            {t('finance.signIn.account')}
          </dt>
          <dd className="font-semibold text-ink">
            <code>{FINANCE_USERNAME}</code>
          </dd>
        </dl>
        {missingEnvNames.length > 0 ? (
          <Notice
            tone="error"
            role="alert"
            title={t('connection.configMissing', { names: missingEnvNames.join(', ') })}
          />
        ) : (
          <Button busy={busy} className="w-full" onClick={() => void signIn()}>
            {busy ? t('finance.signIn.busy') : t('finance.signIn.action')}
          </Button>
        )}
        {failure ? (
          <Notice tone="error" role="alert" title={t(`finance.signIn.failure.${failure}`)} />
        ) : null}
        <div className="space-y-1 border-t border-line-subtle pt-4 text-caption text-ink-muted">
          <p>{t('finance.signIn.demoNote')}</p>
          <p>{t('finance.signIn.sessionNote')}</p>
        </div>
      </section>
    </main>
  );
}
