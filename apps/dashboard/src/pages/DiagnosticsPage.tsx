import { useI18n } from '@mensa/shared/react';
import { candidateId } from '../api';
import { ConnectionCheck } from '../components/ConnectionCheck';
import { Section } from '../components/ui';

/**
 * Build facts and a live check of GET /config from this browser origin: it proves the CORS
 * preflight (X-Candidate-Id, Authorization) and that the Date header is readable, which is what to
 * verify again on a newly deployed origin. The payments switch shown there is for the payer apps;
 * finance reads do not depend on it.
 */
export function DiagnosticsPage() {
  const { t } = useI18n();
  return (
    <>
      <Section id="diagnostics-build" title={t('finance.diagnostics.build')}>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-ink-muted">{t('finance.diagnostics.api')}</dt>
          <dd>
            <code>{import.meta.env.VITE_API_BASE_URL ?? '–'}</code>
          </dd>
          <dt className="text-ink-muted">{t('finance.diagnostics.candidate')}</dt>
          <dd>
            <code>{candidateId ?? '–'}</code>
          </dd>
          <dt className="text-ink-muted">{t('finance.diagnostics.origin')}</dt>
          <dd>
            <code>{window.location.origin}</code>
          </dd>
        </dl>
      </Section>
      <ConnectionCheck />
    </>
  );
}
