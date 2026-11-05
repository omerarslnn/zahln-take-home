import type { AppConfig, TransportResult } from '@mensa/api';
import { formatBerlinDateTime } from '@mensa/shared';
import { useI18n, type I18nValue } from '@mensa/shared/react';
import { useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';
import { apiClient, missingEnvNames } from '../api';
import { Card } from './ui';

type CheckState =
  { phase: 'idle' } | { phase: 'running' } | { phase: 'done'; result: TransportResult<AppConfig> };

/** Calls GET /config through the shared transport to prove the API package works on this device. */
export function ConnectionCheck() {
  const { t, locale } = useI18n();
  const [state, setState] = useState<CheckState>({ phase: 'idle' });

  async function run() {
    if (!apiClient) return;
    setState({ phase: 'running' });
    const result = await apiClient.getConfig();
    setState({ phase: 'done', result });
    // Android announces the live region below; iOS VoiceOver needs an explicit announcement.
    const [summary] = describe(result, t, locale);
    if (Platform.OS === 'ios' && summary) AccessibilityInfo.announceForAccessibility(summary);
  }

  return (
    <Card title={t('connection.title')}>
      <Text className="text-body text-ink-muted">{t('connection.description')}</Text>
      {apiClient ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: state.phase === 'running',
            busy: state.phase === 'running',
          }}
          disabled={state.phase === 'running'}
          onPress={() => void run()}
          className="min-h-touch items-center justify-center rounded-control bg-brand px-4 active:opacity-80"
        >
          <Text className="font-semibold text-brand-on">
            {state.phase === 'running' ? t('connection.running') : t('connection.run')}
          </Text>
        </Pressable>
      ) : (
        <Text accessibilityRole="alert" className="font-semibold text-danger">
          {t('connection.configMissing', { names: missingEnvNames.join(', ') })}
        </Text>
      )}
      <View accessibilityLiveRegion="polite" className="gap-1">
        {state.phase === 'done'
          ? describe(state.result, t, locale).map((line) => (
              <Text key={line} className="text-body text-ink">
                {line}
              </Text>
            ))
          : null}
      </View>
    </Card>
  );
}

/** Turns each transport outcome into readable lines; every outcome kind is handled explicitly. */
function describe(
  result: TransportResult<AppConfig>,
  t: I18nValue['t'],
  locale: I18nValue['locale'],
): string[] {
  const yesNo = (value: boolean) => t(value ? 'common.yes' : 'common.no');
  switch (result.kind) {
    case 'success':
      return [
        t('connection.success', {
          status: result.meta.status,
          duration: Math.round(result.meta.durationMs),
        }),
        t('connection.paymentsEnabled', { value: yesNo(result.data.paymentsEnabled) }),
        t('connection.minAppVersion', { value: result.data.minAppVersion }),
        serverTime(result.meta.serverDate, t, locale),
      ];
    case 'problem':
      return [
        t('connection.problem', {
          code: result.problem.code,
          status: result.meta.status,
          retryable: yesNo(result.problem.retryable),
        }),
        serverTime(result.meta.serverDate, t, locale),
      ];
    case 'invalid_response':
      return [t('connection.invalid', { status: result.meta.status })];
    case 'no_response':
      return [t(result.reason === 'timeout' ? 'connection.timeout' : 'connection.network')];
  }
}

function serverTime(
  serverDate: Date | null,
  t: I18nValue['t'],
  locale: I18nValue['locale'],
): string {
  return serverDate
    ? t('connection.serverTime', { value: formatBerlinDateTime(serverDate, locale) })
    : t('connection.serverTimeUnavailable');
}
