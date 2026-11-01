import type { AppConfig, TransportResult } from '@mensa/api';
import { formatBerlinDateTime } from '@mensa/shared';
import { useI18n } from '@mensa/shared/react';
import { useEffect, useState } from 'react';
import { apiClient, missingApiEnvNames } from '../api';

type CheckState =
  { phase: 'idle' } | { phase: 'running' } | { phase: 'done'; result: TransportResult<AppConfig> };

// `?check` in the URL runs the check on load, e.g. for a headless-browser test or a shared link.
const runOnLoad = apiClient !== null && new URLSearchParams(window.location.search).has('check');

/**
 * Calls GET /config from this browser origin. Unlike a command-line request, this proves that the
 * browser accepts the CORS preflight (X-Candidate-Id is a custom header) and shows whether the
 * Date header is exposed to JavaScript.
 */
export function ConnectionCheck() {
  const { t } = useI18n();
  const [state, setState] = useState<CheckState>({ phase: runOnLoad ? 'running' : 'idle' });

  useEffect(() => {
    if (!runOnLoad || !apiClient) return;
    // Ignore a result that arrives after unmount (or after StrictMode's extra mount in development).
    let current = true;
    void apiClient.getConfig().then((result) => {
      if (current) setState({ phase: 'done', result });
    });
    return () => {
      current = false;
    };
  }, []);

  async function run() {
    if (!apiClient) return;
    setState({ phase: 'running' });
    setState({ phase: 'done', result: await apiClient.getConfig() });
  }

  return (
    <section aria-labelledby="connection-title" className="rounded-card bg-surface p-4 shadow-sm">
      <h2 id="connection-title" className="text-lg font-semibold">
        {t('connection.title')}
      </h2>
      <p className="mt-1 text-ink-muted">{t('connection.description')}</p>
      {apiClient ? (
        <button
          type="button"
          onClick={() => void run()}
          disabled={state.phase === 'running'}
          className="mt-3 min-h-touch rounded-control bg-brand px-4 font-semibold text-brand-on focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
        >
          {state.phase === 'running' ? t('connection.running') : t('connection.run')}
        </button>
      ) : (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {t('connection.configMissing', { names: missingApiEnvNames.join(', ') })}
        </p>
      )}
      <div aria-live="polite" className="mt-3">
        {state.phase === 'done' && <ResultDetails result={state.result} />}
      </div>
    </section>
  );
}

function ResultDetails({ result }: { result: TransportResult<AppConfig> }) {
  const { t, locale } = useI18n();
  const lines: string[] = [];
  switch (result.kind) {
    case 'success':
      lines.push(
        t('connection.success', { status: result.meta.status, duration: result.meta.durationMs }),
        t('connection.paymentsEnabled', {
          value: t(result.data.paymentsEnabled ? 'common.yes' : 'common.no'),
        }),
        t('connection.minAppVersion', { value: result.data.minAppVersion }),
      );
      break;
    case 'problem':
      lines.push(
        t('connection.problem', {
          code: result.problem.code,
          status: result.meta.status,
          retryable: t(result.problem.retryable ? 'common.yes' : 'common.no'),
        }),
      );
      break;
    case 'invalid_response':
      lines.push(t('connection.invalid', { status: result.meta.status }));
      break;
    case 'no_response':
      lines.push(t(result.reason === 'timeout' ? 'connection.timeout' : 'connection.network'));
      break;
  }
  if (result.kind !== 'no_response') {
    lines.push(
      result.meta.serverDate
        ? t('connection.serverTime', {
            value: formatBerlinDateTime(result.meta.serverDate, locale),
          })
        : t('connection.serverTimeUnavailable'),
    );
  }
  return (
    <ul
      data-testid="connection-result"
      data-kind={result.kind}
      data-server-date-readable={result.kind !== 'no_response' && result.meta.serverDate !== null}
      className="list-disc space-y-1 pl-5"
    >
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
